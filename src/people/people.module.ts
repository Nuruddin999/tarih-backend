import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PersonWriteGuard } from './person-write.guard';

@Module({ controllers: [PeopleController], providers: [PeopleService, PersonWriteGuard] })
export class PeopleModule {}
