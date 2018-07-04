import { Injectable } from '@angular/core';
import { Hero } from './hero';

@Injectable({
  providedIn: 'root'
})
export class HeroService {

  constructor() { }

  loadHeroes(): Promise<Hero[]> {
    return this.timeout(1000).then(() => MOCK_HEROES);
  }
  
  private timeout(delay: number): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, delay);
    });
  }
}

const MOCK_HEROES = [
  { id: 3, name: 'Skeleton man', dateCreated: new Date('2018-04-14') },
  { id: 4, name: 'Bone man', dateCreated: new Date('2018-05-10') },
  { id: 7, name: 'John', dateCreated: new Date('2018-06-10') },
  { id: 8, name: 'Peter', dateCreated: new Date('2018-06-20') },
  { id: 9, name: 'Björn', dateCreated: new Date('2018-06-24') },
];