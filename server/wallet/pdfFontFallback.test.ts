import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {createPdfFontFallback} from './pdfFontFallback.js';
const fonts=createRequire(import.meta.url)('pdfmake/build/vfs_fonts');
it('bundled regular bold italic and bold-italic preserve Vietnamese while unsupported CJK and emoji are explicit',()=>{const fallback=createPdfFontFallback(fonts);expect(fallback('Tiếng Việt: cà phê 9.007.199.254.740.993 ₫\n')).toEqual({text:'Tiếng Việt: cà phê 9.007.199.254.740.993 ₫\n',replaced:false});expect(fallback('中文🧪')).toEqual({text:'[U+4E2D][U+6587][U+1F9EA]',replaced:true});expect(fallback('\ud800')).toEqual({text:'[U+D800]',replaced:true});});
it('an absent corrupt or truncated bundled font fails explicitly instead of silently claiming glyph coverage',()=>{for(const value of [{...fonts,'Roboto-Regular.ttf':undefined},{...fonts,'Roboto-Regular.ttf':Buffer.alloc(40).toString('base64')},{...fonts,'Roboto-Regular.ttf':Buffer.from(fonts['Roboto-Regular.ttf'],'base64').subarray(0,30).toString('base64')}])expect(()=>createPdfFontFallback(value)).toThrow();});
