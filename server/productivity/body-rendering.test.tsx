import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import Markdown from '../../src/components/Markdown.js';
it('renders task Markdown as inert text without executable HTML, event handlers or script links',()=>{
 const html=renderToStaticMarkup(<Markdown content={'<script>synthetic()</script>\n\n<img src=x onerror=synthetic()>\n\n[unsafe](javascript:synthetic())\n\n**Synthetic safe emphasis**'}/>);
 expect(html).not.toMatch(/<script\b|<img[^>]+onerror=|href=["']javascript:/i);expect(html).toContain('&lt;script&gt;');expect(html).toContain('<strong');expect(html).toContain('Synthetic safe emphasis');
});
