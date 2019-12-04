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

  it('retains backslashes', () => {
    // Raw input: foo:\bbar\b baz
    const result = splitQuotedString('foo:\\bbar\\b baz');
    expect(result).toEqual(['foo:\\bbar\\b', 'baz']);
  });

  it('retains double backslashes', () => {
    // Raw input: foo:A\\B baz
    const result = splitQuotedString('foo:A\\\\B baz');
    expect(result).toEqual(['foo:A\\\\B', 'baz']);
  });

  it('handles a single backslash', () => {
    const result = splitQuotedString('\\');
    expect(result).toEqual(['\\']);
  });
});
