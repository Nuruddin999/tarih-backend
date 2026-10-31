import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CreatePersonInput, CreatePersonPipe, PeopleQuery, PeopleQueryPipe } from './people.input';
import { PeopleService } from './people.service';
import { PersonWriteGuard } from './person-write.guard';

@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}
  @Post()
  @UseGuards(PersonWriteGuard)
  create(@Body(CreatePersonPipe) input: CreatePersonInput) { return this.people.create(input); }
  @Get()
  list(@Query(PeopleQueryPipe) query: PeopleQuery) { return this.people.list(query); }
}
