import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it,expect } from 'vitest';
import { UpdatePanel } from '../../src/components/UpdatePanel.js';
it('shows operator-managed releases without app apply/restart/Docker controls',()=>{
  const html=renderToStaticMarkup(<UpdatePanel isAdmin={true}/>);
  expect(html).toContain('quản trị viên máy chủ');
  expect(html).toContain('github.com/DongVienNguyen/Family-Organizer/releases');
  for(const value of ['docker compose','STACK_DIR','Tự cập nhật','Cập nhật ngay','Khởi động lại']) expect(html).not.toContain(value);
});
