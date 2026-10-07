export type id = string & { __brand: 'id' };
export const createId = (id: string): id => id as id;
