const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const fa6 = require('react-icons/fa6');

const OUT = path.join(__dirname, 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// name -> [IconComponent, hexColor]
const ICONS = {
  shield:       ['FaShieldHalved',        'F2F6F8'],
  warning:      ['FaTriangleExclamation', 'FFFFFF'],
  trendup:      ['FaArrowTrendUp',        'FFFFFF'],
  eyeslash:     ['FaEyeSlash',            'FFFFFF'],
  flask:        ['FaFlask',               'FFFFFF'],
  layers:       ['FaLayerGroup',          'FFFFFF'],
  check:        ['FaCircleCheck',         'FFFFFF'],
  xmark:        ['FaCircleXmark',         'FFFFFF'],
  question:     ['FaCircleQuestion',      'FFFFFF'],
  camera:       ['FaCamera',              'FFFFFF'],
  idcard:       ['FaAddressCard',         'FFFFFF'],
  link:         ['FaLink',                'FFFFFF'],
  lock:         ['FaLock',                'FFFFFF'],
  scale:        ['FaScaleBalanced',       'FFFFFF'],
  magnify:      ['FaMagnifyingGlass',     'FFFFFF'],
  rocket:       ['FaRocket',              'FFFFFF'],
  fingerprint:  ['FaFingerprint',         'FFFFFF'],
  usershield:   ['FaUserShield',          'FFFFFF'],
  chart:        ['FaChartLine',           'FFFFFF'],
  code:         ['FaCode',                'FFFFFF'],
  info:         ['FaCircleInfo',          'FFFFFF'],
  listcheck:    ['FaClipboardCheck',      'FFFFFF'],
  robot:        ['FaRobot',               'FFFFFF'],
  route:        ['FaRoute',               'FFFFFF'],
  gavel:        ['FaGavel',               'FFFFFF'],
  server:       ['FaServer',              'FFFFFF'],
  mobile:       ['FaMobileScreenButton',  'FFFFFF'],
  cube:         ['FaCubes',               'FFFFFF'],
};

async function run() {
  for (const [key, [compName, color]] of Object.entries(ICONS)) {
    const Comp = fa6[compName];
    if (!Comp) { console.error('MISSING ICON', compName); continue; }
    const svg = ReactDOMServer.renderToStaticMarkup(
      React.createElement(Comp, { size: 256, color: `#${color}` })
    );
    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 512 512">${svg.replace(/<svg[^>]*>|<\/svg>/g, '')}</svg>`;
    const pngPath = path.join(OUT, `${key}.png`);
    await sharp(Buffer.from(fullSvg)).resize(256, 256).png().toFile(pngPath);
    console.log('wrote', pngPath);
  }
}
run().catch(e => { console.error(e); process.exit(1); });
