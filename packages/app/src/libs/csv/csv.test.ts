import { csv2json } from './json';

describe('csv2json', () => {
  it('should convert csv to json', () => {
    const csv = `id,name,gender
1,test1,male
2,test2,female`;
    const json = [
      { id: '1', name: 'test1', gender: 'male' },
      { id: '2', name: 'test2', gender: 'female' },
    ];
    expect(csv2json(csv)).toEqual(json);
  });

  it('should convert csv to json with ; and "', () => {
    const csv = `"id";"name";"gender"
"1";"test1";"male"
"2";"test2";"female"`;
    const json = [
      { id: '1', name: 'test1', gender: 'male' },
      { id: '2', name: 'test2', gender: 'female' },
    ];
    expect(csv2json(csv, { delimiter: ';', quote: '"' })).toEqual(json);
  });
});
