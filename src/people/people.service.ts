import { ConflictException, Injectable } from '@nestjs/common';
import { Madhhab, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonInput, PeopleQuery } from './people.input';

const include = {
  eras: { orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] },
  specialties: { orderBy: { slug: 'asc' } },
  sources: { orderBy: { id: 'asc' } },
} satisfies Prisma.PersonInclude;
type PersonRecord = Prisma.PersonGetPayload<{ include: typeof include }>;
function present(person: PersonRecord) {
  return {
    ...person,
    birth: { hijri: person.birthHijri ?? '', gregorian: person.birthGregorian ?? '' },
    death: { hijri: person.deathHijri ?? '', gregorian: person.deathGregorian ?? '' },
    categories: [...new Set([...person.specialties.map(s => s.slug), ...person.madhhabs])],
  };
}
const normalized = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: CreatePersonInput) {
    const { eras, specialties, sources, ...data } = input;
    try {
      // Nested writes are atomic: failed person creation also rolls back new dictionaries and sources.
      return present(await this.prisma.person.create({
        data: {
          ...data,
          eras: { connectOrCreate: eras.map(entry => ({ where: { slug: entry.slug }, create: entry })) },
          specialties: { connectOrCreate: specialties.map(entry => ({ where: { slug: entry.slug }, create: entry })) },
          sources: { create: sources },
        }, include,
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Slug already exists; for concurrent dictionary creation, retry the request');
      }
      throw error;
    }
  }
  async list(query: PeopleQuery) {
    return this.prisma.$transaction(async tx => {
    const AND: Prisma.PersonWhereInput[] = [];
    if (query.era) AND.push({ eras: { some: { slug: query.era } } });
    if (query.specialty) AND.push({ specialties: { some: { slug: query.specialty } } });
    if (query.madhhab) AND.push({ madhhabs: { has: query.madhhab } });
    if (query.category) {
      AND.push(Object.values(Madhhab).includes(query.category as Madhhab)
        ? { madhhabs: { has: query.category as Madhhab } }
        : { specialties: { some: { slug: query.category } } });
    }
    // Search uses the same combined name/cities substring and ё/е normalization as the client.
    // Candidate ids are intersected in PostgreSQL before pagination and counting.
    if (query.q) {
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Person"
        WHERE replace(lower("name" || ' ' || array_to_string("cities", ' ')), 'ё', 'е')
        LIKE ${'%' + normalized(query.q).replace(/[\\%_]/g, '\\$&') + '%'} ESCAPE '\\'
      `);
      AND.push({ id: { in: ids.map(row => row.id) } });
    }
    const where: Prisma.PersonWhereInput = AND.length ? { AND } : {};
    const total = await tx.person.count({ where });
    const people = await tx.person.findMany({ where, include,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      });
    return { items: people.map(present), total, page: query.page, limit: query.limit,
      totalPages: Math.ceil(total / query.limit) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
