import { MoneyModule } from './money.module';

describe('MoneyModule', () => {
  let moneyModule: MoneyModule;

  beforeEach(() => {
    moneyModule = new MoneyModule();
  });

  it('should create an instance', () => {
    expect(moneyModule).toBeTruthy();
  });
});
