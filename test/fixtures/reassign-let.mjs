import { setEnv } from "./env.mjs";
import {useEnv} from "./useEnv.mjs";

setEnv({ FOO: 'bar'});
useEnv();