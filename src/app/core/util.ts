
/** Adapter between setTimeout and Promises. */
export function delay<T = void>(delay: number, value?: T): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay);
  });
}

export function readFileAsTextAsync(file: Blob, encoding?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event => resolve(event.target.result));
    reader.onerror = reject;
    reader.readAsText(file, encoding);
  });
}