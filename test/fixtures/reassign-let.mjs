import { setEnv } from "./env.mjs"
import {useEnv} from "./use-env.mjs"

setEnv({ FOO: 'bar'})
useEnv()