
const path = require('path');
const Promise = require('bluebird');
const fs = require('fs-extra');
const log = require('fancy-log');
const File = require('./file');
const actions = require('./actions');
const { URL } = require('url');
const { resolve, readFile, isCleanUrl, ENGINE } = require('./resolve');
const { isObject } = require('./lib/util');

const pkg  = require(resolve('package.json'));
const frontmatter = require('front-matter');

module.exports = exports = class Page extends File {

  constructor (filepath) {
    super(filepath);

    this.serializable.push(
      'fullurl',
      'engine',
      'source',
      'meta',
      'images',
      'titlecard',
      'tweets',
      'dateCreated',
      'dateModified',
      'classes',
      'flags',
    );

    var isIndexPage = (this.name === 'index');
    var isClean = isCleanUrl(this.ext);

    if (isClean && isIndexPage) {
      this.output  = path.join(this.base, 'index.html');
      this.json    = path.join(this.base, 'index.json');
      this.url     = this.dir;
    } else if (isClean) {
      this.output  = path.join(this.base, this.name, 'index.html');
      this.json    = path.join(this.base, this.name + '.json');
      this.url     = path.join(this.dir, this.name);
    } else if (isIndexPage) {
      this.output  = path.join(this.base, 'index.html');
      this.json    = path.join(this.base, this.name + '.json');
      this.url     = this.dir;
    } else {
      this.output  = path.join(this.base, this.basename);
      this.json    = path.join(this.base, this.basename + '.json');
      this.url     = path.join(this.dir, this.basename);
    }

    const url = new URL(pkg.siteInfo.siteUrl);
    url.pathname = this.url;
    this.fullurl = url.href;

    this.engine = ENGINE[this.type] || ENGINE.COPY;
  }

  async load (PublicFiles) {
    const [ raw, { ctime, mtime } ] = await Promise.all([
      readFile(this.input).catch(() => null),
      fs.stat(this.input).catch(() => ({})),
    ]);

    const { titlecard, assets } = PublicFiles.for(this.dir);

    // empty file
    if (!raw || !ctime) {
      log.error('Could not load page: ' + this.filepath);
      return false;
    }

    try {
      var { attributes: meta, body } = frontmatter(raw.toString('utf8'));
    } catch (e) {
      log.error('Error while parsing frontmatter for ' + this.filepath, e);
      return false;
    }

    this.source = body;
    this.meta = meta;
    this.images = assets;
    this.titlecard = titlecard;
    this.tweets = (meta.tweets || []).map(parseTweetId);
    this.dateCreated = meta.date && new Date(meta.date) || ctime;
    this.dateModified = mtime;

    this.classes = Array.from(new Set(meta.classes || []));
    this.flags = this.classes.reduce((res, item) => {
      var camelCased = item.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      res[camelCased] = true;
      return res;
    }, {});

    return this;
  }

  tasks () {
    if (!isObject(this.tweets)) return [];

    return Object.values(this.tweets)
      .map((t) => t.media)
      .flat()
      .map((m) => ({ ...m, action: actions.fetch, output: m.output }));
  }

};

/* Utility Functions **************************************************/

const tweeturl = /https?:\/\/twitter\.com\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(\d+)/i;
const tweetidcheck = /^\d+$/;
function parseTweetId (tweetid) {
  // we can't trust an id that isn't a string
  if (typeof tweetid !== 'string') return false;

  const match = tweetid.match(tweeturl);
  if (match) return match[1];
  if (tweetid.match(tweetidcheck)) return tweetid;
  return false;
}
