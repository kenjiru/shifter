
var log = require('./log'),
    Stack = require('./stack').Stack,
    timer = require('timethat'),
    fs = require('fs'),
    path = require('path'),
    shifter = require('./'),
    spawn = require('child_process').spawn,
    exists = require('./util').exists,
    which = require('which').sync,
    has = function (opt, name) {
        return opt.some(function (v) {
            return (v === name);
        });
    };

exports.run = function (options) {
    if (!log.isTTY) {
        options.progress = false;
    }
    log.info('racing the directories');
    var modStack = new Stack(),
        start = new Date(),
        mods = [],
        max = options.max || false,
        bar,
        ProgressBar,
        i,
        args = [];

    if (options.progress) {
        ProgressBar = require('progress'),
        bar = new ProgressBar(log.color('  shifting [', 'magenta') +
        log.color(':bar', 'cyan') + log.color(']', 'magenta') +
        log.color(' :percent :etas', 'yellow'), {
            total: 100,
            width: 100,
            complete: '>',
            incomplete: ' '
        });
    }

    if (options.compressor) {
        args.push('--compressor');
    }
    if (options.semi === false) {
        args.push('--no-semi');
    }
    if (options.coverage === false) {
        args.push('--no-coverage');
    }
    if (options.cache) {
        args.push('--cache');
    }
    if (options.istanbul) {
        args.push('--istanbul');
    }
    if (options.lint) {
        args.push('--lint');
        args.push(options.lint);
    }
    if (options.lint === false) {
        args.push('--no-lint');
    }
    if (options.csslint === false) {
        args.push('--no-csslint');
    }
    if (options['lint-stderr']) {
        args.push('--lint-stderr');
    }
    if (options.strict) {
        args.push('--strict');
    }

    if (options['build-dir']) {
        log.info('walk.js: build-dir: ' + options['build-dir']);
        args.push('--build-dir=' + options['build-dir']);
    }

    Object.keys(options).forEach(function (k) {
        if (k.indexOf('replace-') === 0) {
            args.push('--' + k + '=' + options[k]);
        }
    });

    if (args.length) {
        log.info('using ' + args.join(' '));
    }

    var normalWalk = function(rootPath) {
        fs.readdir(rootPath, modStack.add(function (err, dirs) {
            dirs.forEach(function (mod) {
                var p = path.join(shifter.cwd(), mod);
                exists(path.join(p, 'build.json'), modStack.add(function (yes) {
                    if (yes) {
                        if (!options.modules || has(options.modules, mod)) {
                            mods.push(mod);
                        }
                    }
                }));
            });
        }));
    };

    var recursiveWalk = function(rootPath, subPath, done) {
        var results = [];

        fs.readdir(path.join(rootPath, subPath), function(err, list) {
            if (err)
                return done(err);

            var pending = list.length;
            if (!pending)
                return done(null, results);

            list.forEach(function(file){
                var filePath = path.join(rootPath, subPath, file);

                fs.stat(filePath, function(err, stat) {
                    if (stat && stat.isDirectory()) {
                        var buildFile = path.join(filePath, 'build.json');

                        fs.exists(buildFile, function(yes){
                            if (yes) {
                                results.push(path.join(subPath, file));

                                if (!--pending)
                                    done(null, results);
                            } else {
                                recursiveWalk(rootPath, path.join(subPath, file), function(err, res) {
                                    results = results.concat(res);

                                    if (!--pending)
                                        done(null, results);
                                });
                            }
                        });
                    }
                });
            });
        });
    };

    if (options['recursive-walk']) {
        log.console.log('recursive walk!');
        recursiveWalk(shifter.cwd(), '', modStack.add(function(err, results) {
            if (!err) {
                mods = results;
            }
        }));
    } else {
        log.console.log('normal walk!');
        normalWalk(shifter.cwd());
    }

    modStack.done(function () {

        if (!mods.length) {
            log.error('no modules found, hitting the brakes.');
        }
        if (bar) {
            bar.total = mods.length - 1;
        }
        log.info('found ' + mods.length + ' modules to race' + ((max) ? ' (' + max + ' at a time)' : '') + ', let\'s do this');
        log.warn('this will be quiet, only status will be emitted for speed. failed builds will print after');
        var stack = new Stack(),
            errors = [],
            run = function () {
                var mod = mods.pop(), child;
                if (mod) {
                    child = spawn(which('shifter'), args, {
                        cwd: path.join(shifter.cwd(), mod),
                        stdio: ['ignore', 'ignore', process.stderr]
                    });
                    child.on('exit', stack.add(function (code) {
                        if (options.progress) {
                            bar.tick();
                        } else {
                            process.stdout.write((code ? log.color('!', 'red') : log.color('.', 'white')));
                        }
                        if (code) {
                            errors.push(mod);
                        }
                        run();
                    }));
                }
            };

        if (max) {
            for (i = 0; i < max; i = i + 1) {
                run();
            }
        } else {
            run();
        }

        stack.done(function () {
            console.log('');
            var end = new Date();
            log.info('done racing, the gears are toast');
            log.info('finished in ' + timer.calc(start, end) + ', pretty fast huh?');
            if (errors.length) {
                log.warn('the following builds exited with a 1');
                errors.forEach(function (mod) {
                    console.log('   ', log.color(mod, 'red'));
                });
                process.exit(1);
            }
        });
    });
};
