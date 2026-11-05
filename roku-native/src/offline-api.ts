import { createFixtureApi } from './fixtures.mjs';
const api=createFixtureApi();
export const getImageUrl=(path:any,size?:string)=>api.imageUrl(path);
export const pickImageBaseUrl=()=> 'pkg:/assets/';
export default {...api,loadConfig:()=>api.get('/configuration')};
