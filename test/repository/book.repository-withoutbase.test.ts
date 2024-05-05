import { Optional } from 'typescript-optional';
import {
  IllegalArgumentException,
  ValidationException,
} from '../../src/util/exceptions';
import { AudioBook, PaperBook } from '../domain/book';
import {
  audioBookFixture,
  bookFixture,
  electronicBookFixture,
  paperBookFixture,
} from '../domain/book.fixtures';
import {
  MongoServerType,
  closeMongoConnection,
  deleteAll,
  findById,
  insert,
  setupConnection,
} from '../util/mongo-server';
import {
  BookRepository,
  MongooseBookRepositoryWithoutBaseClass,
} from './book.repository';

const COLLECTION_NAME = 'myBooks';

describe('Given an instance of a book repository without a base Book class defined', () => {
  let bookRepository: BookRepository;
  let storedPaperBook: PaperBook;
  let storedAudioBook: AudioBook;

  beforeAll(async () => {
    await setupConnection(MongoServerType.STANDALONE);
    bookRepository = new MongooseBookRepositoryWithoutBaseClass();
  });

  describe('when searching a book by ID', () => {
    describe('by an undefined ID', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.findById(undefined as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by a null ID', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.findById(null as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by the ID of a nonexistent book', () => {
      it('retrieves an empty book', async () => {
        const book = await bookRepository.findById('000000000000000000000001');
        expect(book).toEqual(Optional.empty());
      });
    });

    describe('by the ID of an existent book', () => {
      beforeEach(async () => {
        const paperBookToStore = paperBookFixture();
        const storedPaperBookId = await insert(
          paperBookToStore,
          COLLECTION_NAME,
          PaperBook.name,
        );
        storedPaperBook = new PaperBook({
          ...paperBookToStore,
          id: storedPaperBookId,
        });
      });

      afterEach(async () => {
        await deleteAll(COLLECTION_NAME);
      });

      it('retrieves the book', async () => {
        const book = await bookRepository.findById(storedPaperBook.id!);
        expect(book.isPresent()).toBe(true);
        expect(book.get()).toEqual(storedPaperBook);
      });
    });
  });

  describe('when searching a book by some filters', () => {
    describe('by an undefined filter', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.findOne(undefined as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by a null filter', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.findOne(null as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by a filter matching no book', () => {
      it('retrieves an empty book', async () => {
        const book = await bookRepository.findOne({
          title: 'The Hobbit',
        });
        expect(book).toEqual(Optional.empty());
      });
    });

    describe('by a filter matching one or more books', () => {
      beforeEach(async () => {
        const paperBookToStore = paperBookFixture();
        const audioBookToStore = audioBookFixture();

        const storedPaperBookId = await insert(
          paperBookToStore,
          COLLECTION_NAME,
          PaperBook.name,
        );
        storedPaperBook = new PaperBook({
          ...paperBookToStore,
          id: storedPaperBookId,
        });

        const storedAudioBookId = await insert(
          audioBookToStore,
          COLLECTION_NAME,
          AudioBook.name,
        );
        storedAudioBook = new AudioBook({
          ...audioBookToStore,
          id: storedAudioBookId,
        });
      });

      describe('by a filter matching one book', () => {
        it('retrieves the book', async () => {
          const book = await bookRepository.findOne({
            title: storedPaperBook.title,
          });
          expect(book.isPresent()).toBe(true);
          expect(book.get()).toEqual(storedPaperBook);
        });
      });

      describe('by a filter matching several books', () => {
        it('retrieves the first book inserted', async () => {
          const book = await bookRepository.findOne({
            title: { $exists: true },
          });
          expect(book.isPresent()).toBe(true);
          expect(book.get()).toEqual(storedPaperBook);
        });
      });

      afterEach(async () => {
        await deleteAll(COLLECTION_NAME);
      });
    });
  });

  describe('when searching a book by a custom field value', () => {
    describe('and the search value is undefined', () => {
      it('throws an error', async () => {
        await expect(
          bookRepository.findByIsbn(undefined as unknown as string),
        ).rejects.toThrow();
      });
    });

    describe('and the search value is null', () => {
      it('throws an error', async () => {
        await expect(
          bookRepository.findByIsbn(null as unknown as string),
        ).rejects.toThrow();
      });
    });

    describe('and there is no book matching the given search value', () => {
      it('returns an empty book', async () => {
        const book = await bookRepository.findByIsbn('0000000000');
        expect(book).toEqual(Optional.empty());
      });
    });

    describe('and there is one book matching the given search value', () => {
      beforeEach(async () => {
        const bookToStore = paperBookFixture();
        const storedBookId = await insert(
          bookToStore,
          COLLECTION_NAME,
          PaperBook.name,
        );
        storedPaperBook = new PaperBook({
          ...bookToStore,
          id: storedBookId,
        });
      });

      afterEach(async () => {
        await deleteAll(COLLECTION_NAME);
      });

      it('returns a book matching the given search value', async () => {
        const book = await bookRepository.findByIsbn(storedPaperBook.isbn);
        expect(book.isPresent()).toBe(true);
        expect(book.get()).toEqual(storedPaperBook);
      });
    });
  });

  describe('when saving a book', () => {
    describe('which type is not registered in the repository', () => {
      it('throws an exception (other subtype)', async () => {
        const bookToInsert = electronicBookFixture();
        await expect(bookRepository.save(bookToInsert)).rejects.toThrow(
          IllegalArgumentException,
        );
      });
      it('throws an exception (base class)', async () => {
        const bookToInsert = bookFixture();
        await expect(bookRepository.save(bookToInsert)).rejects.toThrow(
          IllegalArgumentException,
        );
      });
    });

    describe('which type is registered in the repository', () => {
      describe('that is undefined', () => {
        it('throws an exception', async () => {
          await expect(
            bookRepository.save(undefined as unknown as PaperBook),
          ).rejects.toThrow('The given entity must be valid');
        });
      });

      describe('that is null', () => {
        it('throws an exception', async () => {
          await expect(
            bookRepository.save(null as unknown as PaperBook),
          ).rejects.toThrow('The given entity must be valid');
        });
      });

      describe('that is new', () => {
        describe('and that is of a subtype of Book', () => {
          describe('and some field values are invalid', () => {
            it('throws an exception', async () => {
              const bookToInsert = paperBookFixture({
                title: 'Implementing Domain-Driven Design',
                description: 'Describes Domain-Driven Design in depth',
                isbn: undefined,
              });

              await expect(bookRepository.save(bookToInsert)).rejects.toThrow(
                ValidationException,
              );
            });
          });

          describe('and all field values are valid', () => {
            it('inserts the book', async () => {
              const bookToInsert = paperBookFixture({
                title: 'Implementing Domain-Driven Design',
                description: 'Describes Domain-Driven Design in depth',
                isbn: '0134685998',
              });

              const book = await bookRepository.save(bookToInsert);
              expect(book.id).toBeTruthy();
              expect(book.title).toBe(bookToInsert.title);
              expect(book.description).toBe(bookToInsert.description);
              expect(book.edition).toBe(bookToInsert.edition);
            });
          });
        });
      });

      describe('that is not new', () => {
        describe('and that is of a subtype of Book', () => {
          beforeEach(async () => {
            const paperBookToStore = paperBookFixture();
            const storedPaperBookId = await insert(
              paperBookToStore,
              COLLECTION_NAME,
              PaperBook.name,
            );
            storedPaperBook = new PaperBook({
              ...paperBookToStore,
              id: storedPaperBookId,
            });

            const audioBookToStore = audioBookFixture();
            const storedAudioBookId = await insert(
              audioBookToStore,
              COLLECTION_NAME,
              AudioBook.name,
            );
            storedAudioBook = new AudioBook({
              ...audioBookToStore,
              id: storedAudioBookId,
            });
          });

          afterEach(async () => {
            await deleteAll(COLLECTION_NAME);
          });

          describe('and that specifies partial contents of the subtype', () => {
            describe('and some field values are invalid', () => {
              it('throws an exception', async () => {
                const bookToUpdate = {
                  id: storedAudioBook.id,
                  hostingPlatforms: ['Spotify'],
                  isbn: undefined as unknown as string,
                } as AudioBook;

                await expect(bookRepository.save(bookToUpdate)).rejects.toThrow(
                  ValidationException,
                );
              });
            });

            describe('and all field values are valid', () => {
              it('updates the book', async () => {
                const bookToUpdate = {
                  id: storedAudioBook.id,
                  hostingPlatforms: ['Spotify'],
                } as AudioBook;

                const book = await bookRepository.save(bookToUpdate);
                expect(book.id).toBe(storedAudioBook.id);
                expect(book.title).toBe(storedAudioBook.title);
                expect(book.description).toBe(storedAudioBook.description);
                expect(book.hostingPlatforms).toEqual(
                  bookToUpdate.hostingPlatforms,
                );
              });
            });
          });

          describe('and that specifies all the contents of the subtype', () => {
            describe('and some field values are invalid', () => {
              it('throws an exception', async () => {
                const bookToUpdate = audioBookFixture(
                  {
                    title: 'The Pragmatic Programmer',
                    description: 'This book is a jewel for developers',
                    hostingPlatforms: undefined,
                  },
                  storedAudioBook.id,
                );

                await expect(bookRepository.save(bookToUpdate)).rejects.toThrow(
                  ValidationException,
                );
              });
            });

            describe('and all field values are valid', () => {
              it('updates the book', async () => {
                const bookToUpdate = audioBookFixture(
                  {
                    title: 'The Pragmatic Programmer',
                    description: 'This book is a jewel for developers',
                  },
                  storedAudioBook.id,
                );

                const book = await bookRepository.save(bookToUpdate);
                expect(book.id).toBe(bookToUpdate.id);
                expect(book.title).toBe(bookToUpdate.title);
                expect(book.description).toBe(bookToUpdate.description);
                expect(book.hostingPlatforms).toEqual(
                  bookToUpdate.hostingPlatforms,
                );
                expect(book.format).toEqual(bookToUpdate.format);
              });
            });
          });
        });
      });
    });
  });

  describe('when deleting a book', () => {
    describe('by an undefined ID', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.deleteById(undefined as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by a null ID', () => {
      it('throws an exception', async () => {
        await expect(
          bookRepository.deleteById(undefined as unknown as string),
        ).rejects.toThrow(IllegalArgumentException);
      });
    });

    describe('by the ID of a nonexistent book', () => {
      it('returns false', async () => {
        const isDeleted = await bookRepository.deleteById(
          '00007032a61c4eda79230000',
        );
        expect(isDeleted).toBe(false);
      });
    });

    describe('by the ID of an existent book', () => {
      beforeEach(async () => {
        const bookToStore = paperBookFixture();
        const storedBookId = await insert(bookToStore, COLLECTION_NAME);
        storedPaperBook = new PaperBook({
          ...bookToStore,
          id: storedBookId,
        });
      });

      afterEach(async () => {
        await deleteAll(COLLECTION_NAME);
      });

      it('returns true and the book has been effectively deleted', async () => {
        const isDeleted = await bookRepository.deleteById(storedPaperBook.id!);
        expect(isDeleted).toBe(true);
        expect(await findById(storedPaperBook.id!, COLLECTION_NAME)).toBe(null);
      });
    });
  });

  afterAll(async () => {
    await closeMongoConnection();
  });
});
