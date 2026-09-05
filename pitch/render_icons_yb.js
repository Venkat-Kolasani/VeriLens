const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const fa6 = require('react-icons/fa6');

const OUT = path.join(__dirname, 'icons_yb');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const NAMES = {
  shield: 'FaShieldHalved', warning: 'FaTriangleExclamation', trendup: 'FaArrowTrendUp',
  eyeslash: 'FaEyeSlash', flask: 'FaFlask', layers: 'FaLayerGroup', check: 'FaCircleCheck',
  xmark: 'FaCircleXmark', question: 'FaCircleQuestion', camera: 'FaCamera',
  idcard: 'FaAddressCard', link: 'FaLink', lock: 'FaLock', scale: 'FaScaleBalanced',
  magnify: 'FaMagnifyingGlass', rocket: 'FaRocket', fingerprint: 'FaFingerprint',
  usershield: 'FaUserShield', chart: 'FaChartLine', code: 'FaCode', info: 'FaCircleInfo',
  listcheck: 'FaClipboardCheck', robot: 'FaRobot', route: 'FaRoute', gavel: 'FaGavel',
  server: 'FaServer', mobile: 'FaMobileScreenButton', cube: 'FaCubes',
  layercapture: 'FaCameraRetro', layergate: 'FaFilter', layerlanes: 'FaLayerGroup',
  layerjudge: 'FaScaleBalanced', layerchain: 'FaLink',
};

async function run() {
  // black icons (sit on yellow badges) and white icons (sit on dark/charcoal badges)
  for (const [color, sub] of [['000000', 'blk'], ['FFFFFF', 'wht']]) {
    for (const [key, compName] of Object.entries(NAMES)) {
      const Comp = fa6[compName];
      if (!Comp) { console.error('MISSING', compName); continue; }
      const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { size: 256, color: `#${color}` }));
      // react-icons puts fill="currentColor" on the <svg> ROOT and relies on
      // CSS inheritance for the <path> children to pick it up. Stripping
      // that root tag (to rebuild width/height/viewBox) also strips the one
      // thing carrying the color, so every path fell back to SVG's default
      // fill (black) regardless of what was requested. Fix: pull out just
      // the inner <path> markup and wrap it in a <g fill="#hex"> the paths
      // inherit from directly - plain attribute inheritance, no currentColor
      // resolution required.
      const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
      const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 512 512"><g fill="#${color}">${inner}</g></svg>`;
      await sharp(Buffer.from(fullSvg)).resize(256, 256).png().toFile(path.join(OUT, `${key}_${sub}.png`));
    }
  }
  console.log('done, wrote', Object.keys(NAMES).length * 2, 'icons');
}
run().catch(e => { console.error(e); process.exit(1); });
