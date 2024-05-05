import { Schema } from 'mongoose';
import { Entity } from './entity';
import { IllegalArgumentException } from './exceptions';

/**
 * Models a domain object instance constructor.
 */
export type Constructor<T> = new (...args: any) => T;

/**
 * Models an abstract domain object supertype instance constructor.
 */

export type AbsConstructor<T> = abstract new (...args: any) => T;

/**
 * Models some domain object subtype data.
 */
export type SubtypeData<T> = {
  type: Constructor<T>;
  schema: Schema;
};

/**
 * Models some domain object supertype data.
 */
export type SupertypeData<T> = {
  type?: Constructor<T> | AbsConstructor<T>;
  schema: Schema;
};

/**
 * Models a map of domain object subtypes.
 */
export type SubtypeMap<T> = {
  [key: string]: SubtypeData<T extends infer U ? U : never>;
};

/**
 * Models a map of domain object supertype and subtypes.
 */
export type TypeMap<T extends Entity> =
  | {
      ['Default']: SupertypeData<T>;
    }
  | SubtypeMap<T>;

/**
 * A `TypeMap` implementation designed to ease map content handling for its clients.
 */
export class TypeMapImpl<T extends Entity> {
  readonly typeNames: string[];
  readonly supertypeData: SupertypeData<T>;
  readonly subtypeData: SubtypeData<T>[];

  constructor(map: TypeMap<T>) {
    if (!map.Default) {
      throw new IllegalArgumentException(
        'The given map must include domain supertype data',
      );
    }
    const superType = map.Default;
    this.supertypeData = superType as SupertypeData<T>;
    this.typeNames = Object.keys(map).filter((key) => key !== 'Default');
    this.subtypeData = Object.entries(map).reduce((accumulator, entry) => {
      if (entry[0] !== 'Default') {
        // @ts-expect-error - safe instantiation as any non-root map entry refers to some subtype data
        accumulator.push(entry[1]);
      }
      return accumulator;
    }, []);
  }

  getSubtypeData(type: string): SubtypeData<T> | undefined {
    const index = this.typeNames.indexOf(type);
    return index !== -1 ? this.subtypeData[index] : undefined;
  }

  getSupertypeData() {
    return this.supertypeData;
  }

  getSupertypeName() {
    return this.supertypeData.type?.name;
  }

  getSupertypeType() {
    return this.supertypeData.type;
  }

  getSubtypesData() {
    return this.subtypeData;
  }

  has(type: string) {
    return (
      type === this.getSupertypeName() || this.typeNames.indexOf(type) !== -1
    );
  }
}
