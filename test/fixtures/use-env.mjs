import {env} from "./env.mjs"

export function useEnv() {
  console.log('using env from another module, env.FOO is', env.FOO)
}