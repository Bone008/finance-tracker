import { Component, OnInit } from '@angular/core';
import { Hero } from './hero';
import { HeroService } from './hero.service';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit {
  heroesLoading = false;
  heroes: Hero[] = [];
  selectedHero: Hero | null = null;

  private now: number;

  constructor(private readonly heroService: HeroService) { }

  async ngOnInit() {
    this.now = Date.now();

    this.heroesLoading = true;
    this.heroes = await this.heroService.loadHeroes();
    this.heroesLoading = false;
  }

  getSelectedHeroAge(): number {
    return (this.now - this.selectedHero.dateCreated.getTime())
              / 1000 / 60 / 60;
  }

  onSelect(hero: Hero) {
    this.selectedHero = hero;
  }

}

