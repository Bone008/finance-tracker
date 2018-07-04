import { Component, OnInit } from '@angular/core';
import { Hero } from './hero';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit {
  heroes: Hero[] = MOCK_HEROES;
  selectedHero: Hero|null = null;

  private now: number;

  constructor() { }

  ngOnInit() {
    this.now = Date.now();
  }

  getSelectedHeroAge(): number {
    return (this.now - this.selectedHero.dateCreated.getTime()) / 1000 / 60 / 60;
  }

  onSelect(hero: Hero) {
    this.selectedHero = hero;
  }

}

const MOCK_HEROES = [
  { id: 3, name: 'Skeleton man', dateCreated: new Date('2018-04-14') },
  { id: 4, name: 'Bone man', dateCreated: new Date('2018-05-10') },
  { id: 7, name: 'John', dateCreated: new Date('2018-06-10') },
  { id: 8, name: 'Peter', dateCreated: new Date('2018-06-20') },
  { id: 9, name: 'Björn', dateCreated: new Date('2018-06-24') },
];
