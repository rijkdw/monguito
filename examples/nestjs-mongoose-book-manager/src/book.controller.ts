import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TransactionalRepository } from '../../../dist';
import { AudioBook, Book, PaperBook } from './book';

type PartialBook = { id: string } & Partial<Book>;

function deserialiseAll<T extends Book>(plainBooks: any[]): T[] {
  const books: T[] = [];
  for (const plainBook of plainBooks) {
    books.push('id' in plainBook ? plainBook : deserialise(plainBook));
  }
  return books;
}

function deserialise<T extends Book>(plainBook: any): T {
  let book = null;
  if (plainBook.edition) {
    book = new PaperBook(plainBook);
  } else if (plainBook.hostingPlatforms) {
    book = new AudioBook(plainBook);
  } else {
    book = new Book(plainBook);
  }
  return book;
}

@Controller('books')
export class BookController {
  constructor(
    @Inject('BOOK_REPOSITORY')
    private readonly bookRepository: TransactionalRepository<Book>,
  ) {}

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Book> {
    return (await this.bookRepository.findById(id)).orElseThrow(
      () => new NotFoundException(`Book with ID ${id} not found`),
    );
  }

  @Get()
  async findAll(): Promise<Book[]> {
    return this.bookRepository.findAll();
  }

  @Post()
  async insert(
    @Body({
      transform: (plainBook) => deserialise(plainBook),
    })
    book: Book,
  ): Promise<Book> {
    return this.save(book);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() book: Partial<Book>,
  ): Promise<Book> {
    const bookToUpdate = { ...book, id };
    return this.save(bookToUpdate);
  }

  @Post('/all')
  async saveAll(
    @Body({
      transform: (plainBooks) => deserialiseAll(plainBooks),
    })
    books: (Book | PartialBook)[],
  ): Promise<Book[]> {
    try {
      return await this.bookRepository.saveAll(books);
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  @Delete(':id')
  async deleteById(@Param('id') id: string): Promise<boolean> {
    return this.bookRepository.deleteById(id);
  }

  @Delete()
  async deleteAll(): Promise<number> {
    return this.bookRepository.deleteAll();
  }

  private async save(book: Book | PartialBook): Promise<Book> {
    try {
      return await this.bookRepository.save(book);
    } catch (error) {
      throw new BadRequestException('Bad request', { cause: error });
    }
  }
}
