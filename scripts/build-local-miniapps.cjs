const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const shared = path.join(root, 'miniapps-local/shared');
for (const platform of ['wechat', 'alipay']) {
  const output = path.join(root, 'artifacts', `travelnote-local-${platform}`);
  fs.mkdirSync(path.join(output, 'pages/index'), { recursive: true });
  fs.mkdirSync(path.join(output, 'utils'), { recursive: true });
  const code = fs.readFileSync(path.join(shared, 'page.cjs'), 'utf8').replace("require('./workspace')", "require('../../utils/workspace')");
  fs.writeFileSync(path.join(output, 'pages/index/index.js'), transformSync(code, { target: 'es2015', format: 'cjs' }).code);
  fs.writeFileSync(path.join(output, 'utils/workspace.js'), transformSync(fs.readFileSync(path.join(shared, 'workspace.cjs'), 'utf8'), { target:'es2015', format:'cjs' }).code);
  fs.copyFileSync(path.join(root, 'miniapps/wechat/utils/markdown.js'), path.join(output, 'utils/markdown.js'));
  let template = fs.readFileSync(path.join(shared, 'page.wxml'), 'utf8');
  if (platform === 'alipay') template = template.replace(/wx:/g, 'a:').replace(/bindtap=/g,'onTap=').replace(/bindinput=/g,'onInput=').replace(/bindchange=/g,'onChange=');
  fs.writeFileSync(path.join(output, `pages/index/index.${platform === 'wechat' ? 'wxml' : 'axml'}`), template);
  const css = fs.readFileSync(path.join(shared, 'page.css'), 'utf8');
  fs.writeFileSync(path.join(output, `pages/index/index.${platform === 'wechat' ? 'wxss' : 'acss'}`), css);
  fs.writeFileSync(path.join(output, 'app.js'), 'App({});\n');
  const window = platform === 'wechat' ? { navigationBarTitleText:'TravelNote 本地版', navigationBarBackgroundColor:'#fffdf9', navigationBarTextStyle:'black' } : { defaultTitle:'TravelNote 本地版', titleBarColor:'#fffdf9' };
  fs.writeFileSync(path.join(output, 'app.json'), JSON.stringify({ pages:['pages/index/index'], window }, null, 2));
  const configName = platform === 'wechat' ? 'project.config.json' : 'mini.project.json';
  fs.copyFileSync(path.join(root, 'miniapps-local', platform, configName), path.join(output, configName));
  console.log(output);
}
