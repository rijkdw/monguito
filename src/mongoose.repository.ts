import mongoose, {
  Connection,
  HydratedDocument,
  Model,
  UpdateQuery,
} from 'mongoose';
import { Optional } from 'typescript-optional';
import { PartialEntityWithId, Repository } from './repository';
import { isAuditable } from './util/audit';
import { Entity } from './util/entity';
import {
  IllegalArgumentException,
  UndefinedConstructorException,
  ValidationException,
} from './util/exceptions';
import {
  DeleteByIdOptions,
  FindAllOptions,
  FindByIdOptions,
  FindOneOptions,
  SaveOptions,
} from './util/operation-options';
import { Constructor, TypeMap, TypeMapImpl } from './util/type-map';

export type MongooseRepositoryOptions = {
  connection?: Connection;
  collectionName?: string;
  modelName?: string;
};

/**
 * Abstract Mongoose-based implementation of the {@link Repository} interface.
 */
export abstract class MongooseRepository<T extends Entity & UpdateQuery<T>>
  implements Repository<T>
{
  private readonly typeMap: TypeMapImpl<T>;
  protected readonly entityModel: Model<T>;
  protected readonly connection?: Connection;
  protected readonly collectionName?: string;
  protected readonly modelName?: string;

  /**
   * Sets up the underlying configuration to enable database operation execution.
   * @param {TypeMap<T>} typeMap a map of domain object types supported by this repository.
   * @param {MongooseRepositoryOptions=} options (optional) TODO.
   */
  protected constructor(
    typeMap: TypeMap<T>,
    options?: MongooseRepositoryOptions,
  ) {
    this.typeMap = new TypeMapImpl(typeMap);
    this.connection = options?.connection;
    this.collectionName = options?.collectionName;
    this.modelName = options?.modelName;
    this.entityModel = this.createEntityModel();
  }

  private createEntityModel() {
    let entityModel;
    const supertypeData = this.typeMap.getSupertypeData();
    const modelName = this.typeMap.getSupertypeName() ?? this.modelName;
    if (!modelName) {
      throw new IllegalArgumentException(
        'Either a base class must be provided or the model name must be specified in the options.',
      );
    }
    const schema = supertypeData.schema;
    if (this.connection) {
      entityModel = this.connection.model<T>(
        modelName,
        schema,
        this.collectionName,
      );
    } else {
      entityModel = mongoose.model<T>(modelName, schema, this.collectionName);
    }
    for (const subtypeData of this.typeMap.getSubtypesData()) {
      entityModel.discriminator(subtypeData.type.name, subtypeData.schema);
    }
    return entityModel;
  }

  /**
   * Instantiates a persistable domain object from the given Mongoose Document.
   * @param {HydratedDocument<S> | null} document the given Mongoose Document.
   * @returns {S | null} the resulting persistable domain object instance.
   * @throws {UndefinedConstructorException} if there is no constructor available.
   */
  protected instantiateFrom<S extends T>(
    document: HydratedDocument<S> | null,
  ): S | null {
    if (!document) return null;
    const entityKey = document.get('__t');
    let constructor: Constructor<S> | undefined;
    if (entityKey) {
      constructor = this.typeMap.getSubtypeData(entityKey)
        ?.type as Constructor<S>;
    } else {
      constructor = this.typeMap.getSupertypeType() as Constructor<S>;
    }
    if (constructor) {
      // safe instantiation as no abstract class instance can be stored in the first place
      return new constructor(document.toObject());
    }
    throw new UndefinedConstructorException(
      `There is no registered instance constructor for the document with ID ${document.id}`,
    );
  }

  private setDiscriminatorKeyOn<S extends T>(
    entity: S | PartialEntityWithId<S>,
  ): void {
    const entityClassName = entity['constructor']['name'];
    const isSubtype = entityClassName !== this.typeMap.getSupertypeName();
    const hasEntityDiscriminatorKey = '__t' in entity;
    if (isSubtype && !hasEntityDiscriminatorKey) {
      entity['__t'] = entityClassName;
    }
  }

  private createDocumentAndSetUserId<S extends T>(entity: S, userId?: string) {
    const document = new this.entityModel(entity);
    if (isAuditable(entity)) {
      if (userId) document.$locals.userId = userId;
      document.__v = 0;
    }
    return document;
  }

  /** @inheritdoc */
  async deleteById(id: string, options?: DeleteByIdOptions): Promise<boolean> {
    if (!id) throw new IllegalArgumentException('The given ID must be valid');
    const isDeleted = await this.entityModel.findByIdAndDelete(id, {
      session: options?.session,
    });
    return !!isDeleted;
  }

  /** @inheritdoc */
  async findAll<S extends T>(options?: FindAllOptions): Promise<S[]> {
    if (options?.pageable?.pageNumber && options?.pageable?.pageNumber < 0) {
      throw new IllegalArgumentException(
        'The given page number must be a positive number',
      );
    }
    if (options?.pageable?.offset && options?.pageable?.offset < 0) {
      throw new IllegalArgumentException(
        'The given page offset must be a positive number',
      );
    }

    const offset = options?.pageable?.offset ?? 0;
    const pageNumber = options?.pageable?.pageNumber ?? 0;
    try {
      const documents = await this.entityModel
        .find(options?.filters)
        .skip(pageNumber > 0 ? (pageNumber - 1) * offset : 0)
        .limit(offset)
        .sort(options?.sortBy)
        .session(options?.session ?? null)
        .exec();
      return documents.map((document) => this.instantiateFrom(document) as S);
    } catch (error) {
      throw new IllegalArgumentException(
        'The given optional parameters must be valid',
        error,
      );
    }
  }

  /** @inheritdoc */
  async findById<S extends T>(
    id: string,
    options?: FindByIdOptions,
  ): Promise<Optional<S>> {
    if (!id) throw new IllegalArgumentException('The given ID must be valid');
    const document = await this.entityModel
      .findById(id)
      .session(options?.session ?? null)
      .exec();
    return Optional.ofNullable(this.instantiateFrom(document) as S);
  }

  /** @inheritdoc */
  async findOne<S extends T>(
    filters: any,
    options?: FindOneOptions,
  ): Promise<Optional<S>> {
    if (!filters && !options?.filters)
      throw new IllegalArgumentException('Missing search criteria (filters)');
    const document = await this.entityModel
      .findOne(options?.filters ?? filters)
      .session(options?.session ?? null)
      .exec();
    return Optional.ofNullable(this.instantiateFrom(document) as S);
  }

  /**
   * Inserts an entity.
   * @param {S} entity the entity to insert.
   * @param {SaveOptions=} options (optional) insert operation options.
   * @returns {Promise<S>} the inserted entity.
   * @throws {IllegalArgumentException} if the given entity is `undefined` or `null`.
   */
  protected async insert<S extends T>(
    entity: S,
    options?: SaveOptions,
  ): Promise<S> {
    if (!entity)
      throw new IllegalArgumentException('The given entity must be valid');
    const entityClassName = entity['constructor']['name'];
    if (!this.typeMap.has(entityClassName)) {
      throw new IllegalArgumentException(
        `The entity with name ${entityClassName} is not included in the setup of the custom repository`,
      );
    }
    this.setDiscriminatorKeyOn(entity);
    const document = this.createDocumentAndSetUserId(entity, options?.userId);
    const insertedDocument = (await document.save({
      session: options?.session,
    })) as HydratedDocument<S>;
    return this.instantiateFrom(insertedDocument) as S;
  }

  /** @inheritdoc */
  async save<S extends T>(
    entity: S | PartialEntityWithId<S>,
    options?: SaveOptions,
  ): Promise<S> {
    if (!entity)
      throw new IllegalArgumentException('The given entity must be valid');
    try {
      if (!entity.id) {
        return await this.insert(entity as S, options);
      } else {
        return await this.update(entity as PartialEntityWithId<S>, options);
      }
    } catch (error) {
      if (
        error.message.includes('validation failed') ||
        error.message.includes('duplicate key error')
      ) {
        throw new ValidationException(
          'One or more fields of the given entity do not specify valid values',
          error,
        );
      }
      if (error instanceof UndefinedConstructorException) {
        const entityClassName = entity['constructor']['name'];
        throw new IllegalArgumentException(
          `The entity with name ${entityClassName} is not included in the setup of the custom repository`,
        );
      }
      throw error;
    }
  }

  /**
   * Updates an entity.
   * @param {S} entity the entity to update.
   * @param {SaveOptions=} options (optional) update operation options.
   * @returns {Promise<S>} the updated entity.
   * @throws {IllegalArgumentException} if the given entity is `undefined` or `null` or specifies an `id` not matching any existing entity.
   */
  protected async update<S extends T>(
    entity: PartialEntityWithId<S>,
    options?: SaveOptions,
  ): Promise<S> {
    if (!entity)
      throw new IllegalArgumentException('The given entity must be valid');
    const document = await this.entityModel
      .findById<HydratedDocument<S>>(entity.id)
      .session(options?.session ?? null);
    if (document) {
      document.set(entity);
      document.isNew = false;
      if (isAuditable(document)) {
        if (options?.userId) document.$locals.userId = options?.userId;
        document.__v = (document.__v ?? 0) + 1;
      }
      const updatedDocument = (await document.save({
        session: options?.session,
      })) as HydratedDocument<S>;
      return this.instantiateFrom(updatedDocument) as S;
    }
    throw new IllegalArgumentException(
      `There is no document matching the given ID '${entity.id}'`,
    );
  }
}
