import type {BoardViewCreateInput,BoardTaskCreateInput} from './boardCreationApi.js';
import {assertBoardViewDraft,assertBoardTaskDraft} from './boardCreationApi.js';
import type {BoardPolicy} from './boardPolicyApi.js';
export type KanbanCreateDraft={kind:'view';input:BoardViewCreateInput}|{kind:'task';board:BoardPolicy;input:BoardTaskCreateInput;columnTitle:string};
export function assertKanbanCreateDraft(draft:KanbanCreateDraft){if(draft.kind==='view')assertBoardViewDraft(draft.input);else if(draft.kind==='task')assertBoardTaskDraft(draft.board,draft.input);else throw Error('Unsupported Kanban draft');}
