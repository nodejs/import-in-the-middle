import { testA } from './a.mjs';

export function testB() {
  console.log("testB");
  testA();
}