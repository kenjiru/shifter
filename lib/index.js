/*
Copyright (c) 2012, Yahoo! Inc. All rights reserved.
Code licensed under the BSD License:
http://yuilibrary.com/license/
*/
var log = require('./log'),
    fs = require('fs'),
    path = require('path'),
    pack = require('./pack'),
    args = require('./args'),
    util = require('./util'),
    find = util.find,
    CWD = process.cwd(),
    queue = [],
    buildRunning = false,
    exists = util.exists;

exports.cwd = function() {
    return CWD;
};

var runQueue = function() {
    if (!buildRunning) {
        var item = queue.pop();
        if (item) {
            buildRunning = true;
            exports.init(item.opts, function() {
                buildRunning = false;
                item.callback();
                runQueue();
            });
        }
    }
};

exports.add = function(opts, callback) {
    queue.push({
        opts: opts,
        callback: callback
    });
    runQueue();
};

exports.init = function (opts, initCallback) {
    log.reset();
    var options = args.defaults(opts),
        watch,
        buildFile = options.config,
        buildFileName;

    if (options.cwd) {
        CWD = options.cwd;
    }

    if (options['build-dir']) {
        console.log('index.js: build-dir: ' + options['build-dir']);
        options['build-dir'] = path.resolve(CWD, options['build-dir']);
    }

    if (!buildFile) {
        buildFile = path.join(CWD, 'build.json');
    }
    buildRunning = true;

    buildFileName = path.basename(buildFile);

    options.buildFile = buildFile;
    options.buildFileName = buildFileName;
    
    if (options.version || options.help) {
        require('./help');
        return;
    }

    if (options['global-config']) {
        log.info('racing to find the closest .shifter.json file');
        find(CWD, '.shifter.json', function(err, file) {
            if (file) {
                log.info('woohoo, found a config here: ' + file);
                var json = JSON.parse(fs.readFileSync(file, 'utf8'));
                Object.keys(json).forEach(function(key) {
                    if (!args.has(key)) {
                        log.info('override config found for ' + key);
                        options[key] = json[key];
                    }
                });
            }
        });
    }


    if (options.watch) {
        watch = require('./watch');
        watch.start(options);
        return;
    }

    if (options.quiet) {
        log.quiet();
    }

    if (options.silent) {
        log.silent();
    }

    log.info('revving up');
    if (!options.walk) {
        log.info('looking for ' + buildFileName + ' file');
    }

    exists(buildFile, function (yes) {
        var json, walk, ant;
        if (yes) {
            if (options.ant) {
                log.error('already has a ' + buildFileName + ' file, hitting the brakes');
            }
            log.info('found ' + buildFileName + ' file, shifting');
            try {
                json = require(buildFile);
            } catch (e) {
                console.log(e.stack);
                log.error('hitting the brakes! failed to parse ' + buildFileName + ', syntax error?');
            }
            if (pack.valid(json)) {
                log.info('putting the hammer down, let\'s build this thing!');
                pack.munge(json, options, function (json, options) {
                    var mods, builder;
                    if (options.list) {
                        mods = Object.keys(json.builds).sort();
                        log.info('This module includes these builds:');
                        console.log(mods.join(', '));
                        if (json.rollups) {
                            log.info('and these rollups');
                            console.log(Object.keys(json.rollups).join(', '));
                        }
                    } else {
                        builder = require('./builder');
                        builder.reset();
                        builder.start(json, options, function() {
                            buildRunning = false;
                            if (initCallback) {
                                initCallback();
                            }
                        });
                    }
                });
            } else {
                log.error('hitting the brakes, your ' + buildFileName + ' file is invalid, please fix it!');
            }
        } else {
            if (options.walk) {
                walk = require('./walk');
                walk.run(options);
            } else {
                log.warn('no ' + buildFileName + ' file, downshifting to convert ant files');
                ant = require('./ant');
                ant.process(options, function () {
                    if (!options.ant) {
                        exports.init(options, initCallback);
                    }
                });
            }
        }
    });
};
