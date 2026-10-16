import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
export const productivityProjects=['chromium','firefox','webkit'];
/** Fixed owned report roots; no arbitrary output path or project alias. */
export function productivityReportLayout(project){
 if(project!==undefined&&!productivityProjects.includes(project))throw Error('Unknown productivity browser project');
 const work=project===undefined?root:path.join(root,'reports','productivity-shards',project);
 return {root,project:project??null,work,reports:path.join(work,'reports')};
}
export function productivityProjectArgs(argv){if(argv.length===0)return undefined;if(argv.length!==2||argv[0]!=='--project'||!productivityProjects.includes(argv[1]))throw Error('Expected --project chromium|firefox|webkit');return argv[1];}
