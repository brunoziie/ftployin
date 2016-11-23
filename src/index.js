var CONFIG_FILE = './deploy.json';
var Promise = require('promise');
var ftp = require('ftp');
var ftpClient = new ftp();
var git = require("ggit");
var fs = require('fs');
var opts;
var colors = require('colors');

var getConfig = function () {
    var configFile = CONFIG_FILE,
        content;

    if (fs.existsSync(configFile)) {
        content = fs.readFileSync(configFile);
        return JSON.parse(content);
    } else {
        throw new Error('File "deploy.json" not found. Run `ftployin init` to generate the deploy config file');
    }
}

var updateConfig = function (curHash) {
    opts.lastCommit = curHash;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(opts, true, 2));
    return Promise.resolve();
}

var parseCommitHash = function (line) {
    var hash = line.split(' ')[0] || null;

    if (hash && hash.length === 40) {
        return Promise.resolve(hash);
    } else {
        return Promise.reject(new Error('Invalid git log response'));
    }
}

var getFirstCommit = function () {
    return new Promise(function (resolve, reject) {
        var cmd = 'git log --oneline --no-abbrev-commit | tail -1';

        if (opts.lastCommit) {
            return resolve(opts.lastCommit);
        } else {
            git.exec(cmd, false)
                .then(parseCommitHash)
                .then(resolve)
                .catch(reject);
        }
    });
}

var getCurrentCommit = function () {
    return new Promise(function (resolve, reject) {
        var cmd = 'git log --oneline --no-abbrev-commit --reverse | tail -1';

        git.exec(cmd, false)
            .then(parseCommitHash)
            .then(resolve)
            .catch(reject);
    });
}

var getDirPath = function (file) {
    var parts = file.split('/');

    if (parts.length > 1) {
        return parts.slice(0, -1).join('/');
    } else {
        return null;
    }
}

var dirExists = function (dir) {
    return fs.existsSync(dir);
}

var parseQueue = function (files) {
    return new Promise(function (resolve, reject) {
        var queue = [],
            mkdirQueue = [],
            len = files.length,
            file,
            dir,
            x;

        for (x = 0; x < len; x += 1) {
            file = files[x];

            if (file.mode === 'A') {
                dir = getDirPath(file.name);

                if (dir !== null && mkdirQueue.indexOf(dir) === -1) {
                    mkdirQueue.push(dir);

                    queue.push({
                        mode: 'mkdir',
                        path: dir
                    });
                }

                queue.push({
                    mode: 'upload',
                    path: file.name
                });
            } else if (file.mode === 'M') {
                queue.push({
                    mode: 'upload',
                    path: file.name
                });
            } else if (file.mode === 'D') {
                dir = getDirPath(file.name);

                queue.push({
                    mode: 'delete',
                    path: file.name
                });

                if (mkdirQueue.indexOf(dir) === -1 && !dirExists(dir)) {
                    mkdirQueue.push(dir);

                    queue.push({
                        mode: 'rmdir',
                        path: dir
                    });
                }
            }
        }

        return resolve(queue);
    });
}

var diffParser = function (stdout) {
    return stdout.split('\n')
        .filter(function (curLine) {
            return curLine.trim() !== '';
        })
        .map(function (curLine) {
            var pieces = curLine.split('\t');

            return {
                mode: pieces[0],
                name: pieces[1]
            };
        });
}

var arr2iterator = function (array) {
    var nextIndex = 0;

    return {
        next: function () {
            return nextIndex < array.length ? array[nextIndex++] : false;
        }
    }
}

var getRemotePath = function (path) {
    return (opts.remoteDir !== '' && opts.remoteDir !== null)
        ? opts.remoteDir + '/' + path
        : path;
}

var processQueue = function (queue) {
    var _queue = arr2iterator(queue),
        doItemJob;

    doItemJob = function (item) {
        return new Promise(function (resolve, reject) {
            var space = (item.mode.length === 5) ? '  ' : ' ';

            console.log((' [' + item.mode + ']' + space + item.path).green);

            switch (item.mode) {
                case 'upload':
                    return ftpClient.put(item.path, getRemotePath(item.path), function (err) {
                         (err) ? reject(err) : resolve();
                    });
                case 'delete':
                    return ftpClient.delete(getRemotePath(item.path), true, function (err, files) {
                         (err) ? reject(err) : resolve();
                    });
                case 'mkdir':
                    return ftpClient.mkdir(getRemotePath(item.path), true, function (err, files) {
                         (err) ? reject(err) : resolve();
                    });
                case 'rmdir':
                    return ftpClient.rmdir(getRemotePath(item.path), true, function (err, files) {
                         (err) ? reject(err) : resolve();
                    });
                default:
                    return reject(new Error('Invalid job mode "' + item.mode + '"'));
            }
        });
    };

    return new Promise(function (resolve, reject) {
        var processNext,
            doneItens = [];

        processNext = function () {
            var item = _queue.next();

            if (item === false) {
                return resolve(doneItens);
            }

            doItemJob(item).then(function () {
                doneItens.push(item);
                processNext();
            });
        };

        processNext();
    });
}

var connectRemoteServer = function () {
    return new Promise(function (resolve, reject) {
        ftpClient.on('ready', resolve);
        ftpClient.on('error', reject);
        ftpClient.connect(opts);
    });
}

var disconnectRemoteServer = function () {
    ftpClient.end();
    return Promise.resolve();
}

var getDiff = function (initialCommit) {
    return new Promise(function (resolve, reject) {
        var args = 'diff --name-status ' + initialCommit + ' HEAD',
            spawn = require('child_process').spawn,
            diff = spawn('git', args.split(' ')),
            buffer = '';

        diff.stdout.on('data', (data) => {
            buffer += data;
        });

        diff.stderr.on('data', (data) => {
            reject(data);
        });

        diff.on('close', (code) => {
            if (code === 0) {
                resolve(buffer);
            } else {
                reject(new Error('Error when try to get commits diff'));
            }
        });
    });
}

exports.deploy = function () {
    opts = getConfig();
    
    getFirstCommit()
        .then(getDiff)
        .then(function () {
            console.log(arguments);
            return Promise.resolve(arguments[0]);
        })
        .then(diffParser)
        .then(parseQueue)
        .then(function (queue) {
            if (queue.length > 0) {
                console.log('=> Starting deployment'.green);

                return new Promise(function (resolve, reject) {
                    connectRemoteServer().then(function (arguments) {
                        return resolve(queue);
                    }).catch(reject);
                });
            } else {
                console.log('=> Already up to date. Nothing to deploy.'.yellow);
                process.exit(0);
            }
        })
        .then(processQueue)
        .then(function (queue) {
            //console.log(queue);
            return Promise.resolve();
        })
        .then(getCurrentCommit)
        .then(updateConfig)
        .then(disconnectRemoteServer)
        .then(function () {
            console.log('=> Deployment done.'.green);
            process.exit(0);
        })
        .catch(function (err) {
            console.log('=> Deployment failed.'.red);
            console.log((err && err.stack) ? err.stack : err);
            process.exit(1);
        });
};

exports.init = function () {
    var configObj = {
            host: 'HOSTNAME_OR_IP',
            port: 21,
            user: 'USERNAME',
            password: 'PASSWORD',
            remoteDir: '',
            lastCommit: null
        };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configObj, true, 2));
}
