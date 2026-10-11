import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {it,expect} from 'vitest';
import {UserRole} from '../../src/types.js';
it('actual note sharing control prevents delegated editors changing privacy and explains ownership',()=>{
 const source=fs.readFileSync(new URL('../../src/components/Notes.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile('Notes.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let field:ts.JsxSelfClosingElement|undefined;
 const visit=(node:ts.Node)=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(tree)==='input'&&node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='checked'&&p.initializer?.getText(tree)==='{formIsShared}'))field=node;ts.forEachChild(node,visit);};visit(tree);expect(field).toBeDefined();const disabled=field!.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='disabled') as ts.JsxAttribute|undefined;expect(disabled).toBeDefined();const expression=(disabled!.initializer as ts.JsxExpression).expression!.getText(tree);
 for(const [role,creator,isNew,expected] of [[UserRole.GUEST,UserRole.ADMIN,false,true],[UserRole.CHILD,UserRole.ADMIN,false,true],[UserRole.MEMBER,UserRole.ADMIN,false,true],[UserRole.ADMIN,UserRole.MEMBER,false,false],[UserRole.GUEST,UserRole.GUEST,false,false],[UserRole.GUEST,UserRole.ADMIN,true,false]] as const)expect(vm.runInNewContext(expression,{currentUser:{id:role,role},UserRole,editingNote:isNew?null:{creatorId:creator}})).toBe(expected);
 const described=field!.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='aria-describedby') as ts.JsxAttribute;expect(described?.initializer?.getText(tree)).toContain('note-sharing-policy');expect(source).toContain('id="note-sharing-policy"');expect(source).toContain('notes.sharingOwnerOnly');
});
it('every supported locale explains creator or Admin note sharing authority',()=>{for(const locale of ['vi','en','zh']){const messages=JSON.parse(fs.readFileSync(new URL('../../src/i18n/locales/'+locale+'.json',import.meta.url),'utf8'));expect(typeof messages.notes.sharingOwnerOnly).toBe('string');expect(messages.notes.sharingOwnerOnly.length).toBeGreaterThan(8);}});
