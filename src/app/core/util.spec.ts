import { splitQuotedString } from "./util";

describe('splitQuotedString', () => {
  it('splits basic strings', () => {
    const result = splitQuotedString('foo bar hello world');
    expect(result).toEqual(['foo', 'bar', 'hello', 'world']);
  });

  it('splits empty string', () => {
    const result = splitQuotedString('');
    expect(result).toEqual([]);
  });

  it('splits whitespace-only string', () => {
    const result = splitQuotedString('   ');
    expect(result).toEqual([]);
  });

  it('splits quoted strings', () => {
    const result = splitQuotedString('"foo bar" "hello world" my dude');
    expect(result).toEqual(['foo bar', 'hello world', 'my', 'dude']);
  });

  it('splits partially quoted strings', () => {
    const result = splitQuotedString('x account="foo bar" y');
    expect(result).toEqual(['x', 'account=foo bar', 'y']);
  });

  it('handles escaped spaces', () => {
    const result = splitQuotedString('foo\\ bar hello world');
    expect(result).toEqual(['foo bar', 'hello', 'world']);
  });

  it('handles escaped quotes', () => {
    // Raw input: foo"bar string" with \"escapes\" wow"
    const result = splitQuotedString('foo\\"bar string" with \\"escapes\\" wow"');
    expect(result).toEqual(['foo"bar', 'string with "escapes" wow']);
  });
});
