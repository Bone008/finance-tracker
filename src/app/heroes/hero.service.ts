import { Injectable } from '@angular/core';
import { delay } from '../core/util';
import { Hero } from './hero';

@Injectable({
  providedIn: 'root'
})
export class HeroService {

  constructor() { }

  loadHeroes(): Promise<Hero[]> {
    return delay(1000, MOCK_HEROES);
  }
}

const MOCK_HEROES = [
  { id: 3, name: 'Skeleton man', dateCreated: new Date('2018-04-14') },
  { id: 4, name: 'Bone man', dateCreated: new Date('2018-05-10') },
  { id: 7, name: 'John', dateCreated: new Date('2018-06-10') },
  { id: 8, name: 'Peter', dateCreated: new Date('2018-06-20') },
  { id: 9, name: 'Björn', dateCreated: new Date('2018-06-24') },
];