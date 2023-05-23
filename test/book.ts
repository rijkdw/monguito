import { Entity } from '../src/util/entity';

export class Book implements Entity {
  readonly id?: string;
  readonly title: string;
  readonly description: string;
  readonly isbn: string;

  constructor(book: {
    id?: string;
    title: string;
    description: string;
    isbn: string;
  }) {
    this.id = book.id;
    this.title = book.title;
    this.description = book.description;
    this.isbn = book.isbn;
  }
}

export class PaperBook extends Book {
  readonly edition: number;

  constructor(paperBook: {
    id?: string;
    title: string;
    description: string;
    isbn: string;
    edition: number;
  }) {
    super(paperBook);
    this.edition = paperBook.edition;
  }
}

export class AudioBook extends Book {
  readonly hostingPlatforms: string[];
  readonly format?: string;

  constructor(audioBook: {
    id?: string;
    title: string;
    description: string;
    isbn: string;
    hostingPlatforms: string[];
    format?: string;
  }) {
    super(audioBook);
    this.hostingPlatforms = audioBook.hostingPlatforms;
    this.format = audioBook.format ?? undefined;
  }
}

export class ElectronicBook extends Book {
  readonly extension: string;

  constructor(electronicBook: {
    id?: string;
    title: string;
    description: string;
    isbn: string;
    extension: string;
  }) {
    super(electronicBook);
    this.extension = electronicBook.extension;
  }
}
