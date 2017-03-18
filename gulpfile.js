'use strict';
var extend = require('util')._extend;
var fs = require('fs');
var del = require('del');
var ws = require('ws');
var gulp = require('gulp');
var concat = require('gulp-concat');
var replace = require('gulp-replace');
var minifyCss = require('gulp-minify-css');
var sass = require('gulp-sass');
var uglify = require('gulp-uglify');
var glob = require('gulp-glob-html');
var templateCache = require('gulp-angular-templatecache');
var minifyHtml = require('gulp-minify-html');
var rename = require('gulp-rename');
var rev = require('gulp-rev');
var revReplace = require('gulp-rev-replace');
var useref = require('gulp-useref');
var filter = require('gulp-filter');
var imagemin = require('gulp-imagemin');
var watch = require('gulp-watch');
var sourcemaps = require('gulp-sourcemaps');
var gulpIf = require('gulp-if');
var aws = require('aws-sdk');
var globfs = require('glob');
var lazypipe = require('lazypipe');
var eslint = require('gulp-eslint');
var through = require('through2');

var config = extend({
    srcDir: './app',
    distDir: './dist',
    tmpDir: './.tmp',
    serverHost: '0.0.0.0',
    override: {},
    liveReloadPort: 35729,
    liveReloadClientPort: 35729,
    webSocketProtocol: 'ws',
    useSourceMaps: true,
    googleAnalyticsDevId: '',
    sourceMapURLPrefix: 'https://orion.managewp.com',

    // cdn specific, overwrite in gulp.local.json
    "cdnUrl": null,
    "s3Directory": null,
    "s3Bucket": null,
    "s3Region": null,
    "s3AccessKey": null,
    "s3SecretKey": null,
    "sourceMapDirectory": null
}, require('./gulp.local.json'));

if (process.argv.indexOf('--no-livereload') !== -1) {
    config.liveReloadPort = false;
}

if (process.argv.indexOf('--no-source-maps') !== -1) {
    config.useSourceMaps = false;
}

if (process.argv.indexOf('--no-splash') !== -1) {
    config.override.hideSplashScreen = true;
}

function isLintFixed(file) {
    // Has ESLint fixed the file contents?
    return file.eslint && file.eslint.fixed;
}

function lintFile(filePath) {
    return gulp.src(filePath)
        .pipe(eslint())
        .pipe(eslint.format());
}

function runInitialLint() {
    return gulp.src(['app/**/*.js'])
        .pipe(eslint())
        .pipe(eslint.formatEach());
}

function runFullLint() {
    var fix = process.argv.indexOf('--fix-lint-errors') !== -1;
    return gulp.src(['app/**/*.js'])
        .pipe(eslint({fix: fix}))
        .pipe(eslint.formatEach())
        .pipe(eslint.failAfterError())
        .pipe(gulpIf(isLintFixed, gulp.dest('./')));
}

function getConfigData() {
    return JSON.stringify([config.srcDir + '/config.json', config.srcDir + '/config.local.json', config.override].reduce(function (carry, data) {
        try {
            if (typeof data === 'string') {
                data = JSON.parse(fs.readFileSync(data).toString());
            }
            return extend(carry, data);
        } catch (e) {
            return carry;
        }
    }, {}));
}

function clean(cb) {
    del(config.distDir, cb);
}

function cleanApiDashboardPath(cb) {
    del(config.apiDashboardIndexPath, {force: true}, cb);
}

function cleanTmp(cb) {
    del(config.tmpDir, cb);
}

function buildCssDev() {
    return gulp.src([config.srcDir + '/styles/bootstrap.scss', config.srcDir + '/styles/application.scss', config.srcDir + '/styles/signup-onboarding.scss'])
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.init()))
        .pipe(sass({
            includePaths: [
                config.srcDir + '/bower_components',
                config.srcDir + '/bower_components/bootstrap-sass-official/assets/stylesheets'
            ]
        }).on('error', sass.logError))
        // Prefix images/fonts with /dashboard - nginx rules are setup this way
        .pipe(replace(/url\((")?\/(styles|images)/g, 'url($1/dashboard/$2'))
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.write()))
        .pipe(gulp.dest(config.distDir + '/styles'));
}

function buildDashboardCssDev() {
    return gulp.src([config.srcDir + '/styles/application.scss'])
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.init()))
        .pipe(sass({
            includePaths: [
                config.srcDir + '/bower_components',
                config.srcDir + '/bower_components/bootstrap-sass-official/assets/stylesheets'
            ]
        }).on('error', sass.logError))
        // Prefix images/fonts with /dashboard - nginx rules are setup this way
        .pipe(replace(/url\((")?\/(styles|images)/g, 'url($1/dashboard/$2'))
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.write()))
        .pipe(gulp.dest(config.distDir + '/styles'));
}

function buildOnboardingCssDev() {
    return gulp.src([config.srcDir + '/styles/signup-onboarding.scss'])
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.init()))
        .pipe(sass({
            includePaths: [
                config.srcDir + '/bower_components',
                config.srcDir + '/bower_components/bootstrap-sass-official/assets/stylesheets'
            ]
        }).on('error', sass.logError))
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.write()))
        .pipe(gulp.dest(config.distDir + '/styles'));
}

function buildBootstrapCssDev() {
    return gulp.src([config.srcDir + '/styles/bootstrap.scss'])
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.init()))
        .pipe(sass({
            includePaths: [
                config.srcDir + '/bower_components',
                config.srcDir + '/bower_components/bootstrap-sass-official/assets/stylesheets'
            ]
        }).on('error', sass.logError))
        .pipe(gulpIf(config.useSourceMaps, sourcemaps.write()))
        .pipe(gulp.dest(config.distDir + '/styles'));
}

function buildCss() {
    return gulp.src([config.srcDir + '/styles/bootstrap.scss', config.srcDir + '/styles/application.scss', config.srcDir + '/styles/signup-onboarding.scss'])
        .pipe(sass({
            includePaths: [
                config.srcDir + '/bower_components',
                config.srcDir + '/bower_components/bootstrap-sass-official/assets/stylesheets'
            ]
        }).on('error', sass.logError))
        .pipe(minifyCss())
        .pipe(gulp.dest(config.tmpDir + '/styles'));
}

function compileTemplate() {
    return templateCache({
        filename: 'template.js',
        module: 'mwpApp.template',
        standalone: true,
        root: 'views/',
        templateHeader: 'function loadTemplateModule() { angular.module("<%= module %>"<%= standalone %>).run(["$templateCache", function($templateCache){',
        templateFooter: '}]); }'
    });
}

function buildTemplateDev() {
    return gulp.src([config.srcDir + '/views/**/*.html', config.srcDir + '/application/**/*.html'])
        .pipe(compileTemplate())
        .pipe(gulp.dest(config.distDir + '/scripts'));
}

function buildTemplate() {
    return gulp.src([config.srcDir + '/views/**/*.html', config.srcDir + '/application/**/*.html'])
        .pipe(minifyHtml({empty: true, loose: true, spare: true}))
        .pipe(compileTemplate())
        .pipe(uglify())
        .pipe(gulp.dest(config.tmpDir + '/scripts'));
}

var updateTimestamp = through.obj(function(file, enc, done) {
    var now = new Date;
    fs.utimes(file.path, now, now, done);
});

function buildHtmlDev() {
    var html = gulp.src(config.srcDir + '/index.php');
    if (config.liveReloadPort) {
        html.pipe(replace(/<\/body>/, '<script>\n    \'use strict\';\n    (function(){\n        var attempts = 1;\n        var loadingCss = 0;\n\n        function createWebSocket() {\n            //noinspection JSClosureCompilerSyntax\n            var ws = new WebSocket(\'WEB_SOCKET_PROTOCOL://localhost:LIVERELOAD_PORT\');\n\n            ws.onopen = function () {\n                attempts = 1;\n            }\n\n            ws.onmessage = function (event) {\n                if (event.data === \'css\') {\n                    [].slice.call(document.getElementsByTagName(\'link\')).forEach(function (link) {\n                        if (link.rel !== \'stylesheet\') {\n                            return;\n                        }\n                        if (link.getAttribute(\'href\').match(/^(https?:)?\\/\\//)) {\n                            // Ignore absolute URLs; let\'s say they are external.\n                            return;\n                        }\n                        //noinspection JSClosureCompilerSyntax\n                        link.setAttribute(\'href\', link.getAttribute(\'href\').replace(/(\\?\\d+)?$/, \'?\' + new Date().getTime()));\n                        loadingCss++;\n                        var interval = setInterval(function () {\n                            if (!link.sheet.cssRules.length) {\n                                return;\n                            }\n                            // This style has fully loaded.\n                            loadingCss--;\n                            clearInterval(interval);\n\n                            if (loadingCss !== 0) {\n                                // Wait for all the styles to load.\n                                return;\n                            }\n                            // Force redraw.\n                            document.body.style.display = \'none\';\n                            document.body.style.display = \'\';\n                        }, 100);\n                    })\n                } else if (event.data === \'html\') {\n                    window.location.reload();\n                }\n            }\n\n            ws.onclose = function () {\n                var time = generateInterval(attempts);\n\n                setTimeout(function () {\n                    attempts++;\n                    createWebSocket();\n                }, time)\n            }\n        }\n\n        function generateInterval(k) {\n            var maxInterval = (Math.pow(2, k) - 1) * 1000;\n\n            if (maxInterval > 30 * 1000) {\n                maxInterval = 30 * 1000; // If the generated interval is more than 30 seconds, truncate it down to 30 seconds.\n            }\n\n            // generate the interval to a random number between 0 and the maxInterval determined from above\n            return Math.random() * maxInterval;\n        }\n\n        createWebSocket();\n    })();\n</script>\n</body>'.replace('LIVERELOAD_PORT', config.liveReloadClientPort).replace('WEB_SOCKET_PROTOCOL', config.webSocketProtocol)));
    }

    html.pipe(replace('<!-- mwp-profiler -->', "<script>var _mwp_profiler_shown=false;window.showMwpProfiler=function(){if(_mwp_profiler_shown){return}_mwp_profiler_shown=true;var cancelDigestHook,digestsPerSecond=0,timeoutId=0,$rootScope=angular.element('#mwpApp').injector().get('$rootScope');$('body').append($('<div />').attr('id','mwp-profiler-widget').css('position','absolute').css('padding','20px').css('bottom','0').css('right','0').css('z-index',99999).css('background-color','gainsboro').append($('<div />').html('Digests: <span id=\"mwp-profiler-widget-digests\">0</span>')).append($('<div />').html('Watchers: <span id=\"mwp-profiler-widget-watchers\">0</span>')));function countWatchers($rootScope){var watchers,target,next,count=0;var current=target=$rootScope;do{if((watchers=current.$$watchers)){count+=watchers.length}if(!(next=(current.$$childHead||(current!==target&&current.$$nextSibling)))){while(current!==target&&!(next=current.$$nextSibling)){current=current.$parent}}}while((current=next));return count}function hookOntoDigest($rootScope){return $rootScope.$watch(function(){digestsPerSecond++})}function update(){if(!_mwp_profiler_shown){cancelDigestHook();timeoutId=0;return}angular.element('#mwp-profiler-widget-digests').text(digestsPerSecond+'/s');angular.element('#mwp-profiler-widget-watchers').text(countWatchers($rootScope));timeoutId=setTimeout(update,1000);digestsPerSecond=0}cancelDigestHook=hookOntoDigest($rootScope);timeoutId=setTimeout(update,1000)};window.hideMwpProfiler=function(){if(!_mwp_profiler_shown){return}_mwp_profiler_shown=false;angular.element('#mwp-profiler-widget').remove()};</script>"));

    html.pipe(replace(/"\.\.\/\.tmp\/scripts\/template.js"/ig, '"scripts/template.js"'));

    html.pipe(replace('<!-- GA-DEV-ID -->', config.googleAnalyticsDevId));

    return html.pipe(replace('{<!--/app/config.json-->}', getConfigData()))
        .pipe(glob())
        // Prefix all assets with /dashboard - nginx rules are setup this way
        .pipe(replace(/"(bower_components|scripts|styles|images|application|assets)\//ig, '"/dashboard/$1/'))
        .pipe(replace(/<!--\s*env:\s*prod\s*-->(.|\s)*?<!--\s*envend\s*-->/ig, ''))
        .pipe(gulp.dest(config.distDir))
        .pipe(rename('dashboardIndex_dev.php'))
        // @TODO Find a fix for add new timestamp to index file so php doesn't cache it.
        .pipe(gulp.dest(config.apiDashboardIndexPath));
}

function buildHtml() {
    var jsFilter = filter('**/*.js', {restore: true});
    var cssFilter = filter('**/*.css', {restore: true});
    var indexFilter = filter('**/index.html', {restore: true});
    var notIndexFilter = filter(['**/*', '!**/index.html'], {restore: true});

    return gulp.src(config.srcDir + '/index.php')
    // gulp-rev-replace does not consider .php files
        .pipe(rename('index.html'))
        .pipe(replace('{<!--/app/config.json-->}', getConfigData()))
        .pipe(replace(/"bower_components\/angular\/angular\.js"/ig, '"bower_components/angular/angular.min.js"'))
        .pipe(replace(/"bower_components\/jquery\/dist\/jquery\.js"/ig, '"bower_components/jquery/dist/jquery.min.js"'))
        .pipe(replace(/"bower_components\/plupload\/js\/plupload\.dev\.js"/ig, '"bower_components/plupload/js/plupload.min.js"'))
        .pipe(replace(/"bower_components\/plupload\/js\/moxie\.js"/ig, '"bower_components/plupload/js/moxie.min.js"'))
        .pipe(replace(/"bower_components\/highcharts-release\/highcharts\.src\.js"/ig, '"bower_components/highcharts-release/highcharts.js"'))
        .pipe(replace(/"bower_components\/highcharts-release\/highcharts-more\.src\.js"/ig, '"bower_components/highcharts-release/highcharts-more.js"'))
        .pipe(replace(/"bower_components\/highcharts-release\/highcharts-3d\.src\.js"/ig, '"bower_components/highcharts-release/highcharts-3d.js"'))
        .pipe(replace(/"bower_components\/highcharts-ng\/dist\/highcharts-ng\.js"/ig, '"bower_components/highcharts-ng/dist/highcharts-ng.min.js"'))
        .pipe(replace(/"bower_components\/angular-ui-ace\/ui-ace\.js"/ig, '"bower_components/angular-ui-ace/ui-ace.min.js"'))
        .pipe(replace(/"bower_components\/ng-sortable\/dist\/ng-sortable\.js"/ig, '"bower_components/ng-sortable/dist/ng-sortable.min.js"'))
        .pipe(revReplace({manifest: gulp.src(config.tmpDir + '/rev-manifest.json')})) // Replace misc assets, like favicons.
        .pipe(useref({}, lazypipe().pipe(sourcemaps.init)))
        .pipe(jsFilter)
        .pipe(uglify())                     // Minify any javascript sources
        .pipe(jsFilter.restore)
        .pipe(cssFilter)
        .pipe(revReplace({manifest: gulp.src(config.tmpDir + '/rev-manifest.json')}))
        .pipe(minifyCss())                  // Minify any CSS sources
        .pipe(cssFilter.restore)
        .pipe(notIndexFilter)
        .pipe(rev())                        // Rename the concatenated files
        .pipe(notIndexFilter.restore)
        .pipe(revReplace())                 // Substitute in new filenames
        .pipe(replace(/<script src=/g, '<script async src='))
        .pipe(replace(/<!--\s*env:\s*dev\s*-->(.|\s)*?<!--\s*envdevend\s*-->/ig, ''))
        .pipe(sourcemaps.write('source-maps', {sourceMappingURLPrefix: config.sourceMapURLPrefix}))
        .pipe(gulp.dest(config.distDir))

        .pipe(indexFilter)
        .pipe(rename('dashboardIndex_prod.php'))
        .pipe(gulp.dest(config.apiDashboardIndexPath))
        .pipe(indexFilter.restore);
}

// This takes care of rewriting assets to the dashboard.managewp.dev domain for testing the production environment locally.
// Complicated production nginx rewrite rules for orion.managewp.dev are avoided this way.
// Only use in local test builds.
function rewriteHostBase() {
    return gulp.src(config.distDir + '/index.html')
        .pipe(replace(/( src=")(scripts\/|images\/)/g, '$1' + '//dashboard.managewp.dev/' + '$2'))
        .pipe(replace(/( href=")(styles\/|images\/)/g, '$1' + '//dashboard.managewp.dev/' + '$2'))
        .pipe(replace(/( content=")(images\/)/g, '$1' + '//dashboard.managewp.dev/' + '$2'))
        .pipe(gulp.dest(config.distDir))
        .pipe(rename('dashboardIndex_prod.php'))
        .pipe(gulp.dest(config.apiDashboardIndexPath));
}

gulp.task(buildHtml);

var reload = function () {
};

function liveReload() {
    var wss = new ws.Server({port: config.liveReloadPort});

    wss.on('connection', function connection(socket) {
        reload = function (what) {
            socket.send(what);
        };
        socket.on('close', function () {
            reload = function () {
            };
        });
    });
}

function reloadComponent(component) {
    reload(component);
}

function watchProject() {
    watch([
        config.srcDir + '/index.php',
        config.srcDir + '/config.json',
        config.srcDir + '/config.local.json'
    ], gulp.series(buildHtmlDev, reloadComponent.bind(null, 'html')));
    var jsWatcher = watch([
        config.srcDir + '/scripts/**/*.js',
        config.srcDir + '/application/**/*.js',
    ], gulp.series(buildHtmlDev, reloadComponent.bind(null, 'html')));
    //jsWatcher.on('change', lintFile);
    watch([
        config.srcDir + '/styles/**/*.scss',
        config.srcDir + '/application/**/*.scss',
        config.srcDir + '/assets/styles/**/*.scss',
        '!' + config.srcDir + '/styles/bootstrap.scss',
        '!' + config.srcDir + '/styles/signup-onboarding.scss'
    ], gulp.series(buildDashboardCssDev, reloadComponent.bind(null, 'css')));
    watch([
        config.srcDir + '/styles/signup-onboarding.scss',
        config.srcDir + '/styles/_mixins.scss',
        config.srcDir + '/styles/_variables.scss',
        config.srcDir + '/styles/dashboard/_intro.scss',
        config.srcDir + '/styles/components/_throbbing.scss',
        config.srcDir + '/styles/components/_modal-popover.scss'
    ], gulp.series(buildOnboardingCssDev, reloadComponent.bind(null, 'css')));
    watch([
        config.srcDir + '/styles/bootstrap.scss',
        config.srcDir + '/styles/_mixins.scss',
        config.srcDir + '/styles/_variables.scss'
    ], gulp.series(buildBootstrapCssDev, reloadComponent.bind(null, 'css')));
    watch([
        config.srcDir + '/views/**/*.html',
        config.srcDir + '/application/**/*.html',
    ], gulp.series(buildTemplateDev, reloadComponent.bind(null, 'html')));
}

function signalReady() {
    console.log('Development setup complete!');
    if (process.argv.indexOf('--npm-script') === -1) {
        console.log('\x1b[31mIt is recommended to use the `npm start` script to run development environment.', '\x1b[0m');
    }
}

function optimizeAssets() {
    var notSvgFilter = filter(['*/**', '!**/*.svg'], {restore: true});
    // Kinda hacky using 'image*' instead of 'images', but on windows setting the 'base' property
    // won't make rev.manifest() build the manifest file properly (the original paths will be absolute).
    return gulp.src(config.srcDir + '/image*/**/*')
        .pipe(notSvgFilter)
        .pipe(imagemin())
        .pipe(notSvgFilter.restore)
        .pipe(rev())
        .pipe(gulp.dest(config.distDir))
        .pipe(rev.manifest())
        .pipe(gulp.dest(config.tmpDir));
}

function copyStaticAssets() {
    return gulp.src([
        config.srcDir + '/favicon.ico',
        config.srcDir + '/gdpfavicon.ico',
        config.srcDir + '/robots.txt',
        config.srcDir + '/styles/fonts/**/*.{otf,eot,svg,ttf,woff,woff2}'
    ], {base: config.srcDir})
        .pipe(gulp.dest(config.distDir));
}

function assertCdnConfig(cb) {
    if (config.cdnUrl === null || config.s3Bucket === null || config.s3Region === null ||
        config.s3AccessKey === null || config.s3SecretKey === null) {
        throw new Error("CDN Configuration incomplete!");
    }

    if (config.cdnUrl.slice(-1) === '/') {
        config.cdnUrl = config.cdnUrl.substr(0, config.cdnUrl.length - 1);
    }

    cb();
}

function switchToCdn(cb) {
    var timestamp = Math.floor(new Date().getTime() / 1000);
    var cdn = config.cdnUrl + '/' + timestamp + '/';

    gulp.series(
        gulp.parallel(
            function replaceHtmlAssetPaths() {
                return gulp.src(config.apiDashboardIndexPath + '/dashboardIndex_prod.php')
                    .pipe(replace(/( src=")(scripts\/|images\/|application\/|assets\/)/g, '$1' + cdn + '$2'))
                    .pipe(replace(/( href=")(styles\/|images\/|assets\/)/g, '$1' + cdn + '$2'))
                    .pipe(replace(/( content=")(images\/|assets\/)/g, '$1' + cdn + '$2'))
                    .pipe(gulp.dest(config.apiDashboardIndexPath));
            },
            function rewriteCss() {
                return gulp.src(config.distDir + '/**/*.css')
                    .pipe(replace(/url\(\/(styles|images|assets)/g, 'url(/' + config.s3Directory + '/' + timestamp + '/$1'))
                    .pipe(gulp.dest(config.distDir));
            }
        ),
        function uploadToS3(done) {
            uploadAssetsToS3(timestamp, function () {
                done();
                cb();
            });
        }
    )();
}

function uploadAssetsToS3(timestamp, cb) {
    var s3 = new aws.S3({
        apiVersion: '2006-03-01',
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
        maxRetries: 10,
        paramValidation: true,
        computeChecksums: true,
        region: config.s3Region
    });

    var s3KeyFor = function (filename) {
        if (filename.match(/^source-maps\/.*\.map$/)) {
            return config.sourceMapDirectory + '/' + filename.replace('source-maps/', '');
        } else {
            return config.s3Directory + '/' + timestamp + '/' + filename;
        }

    };

    /**
     * S3 requires explicit Content-Type header
     * CloudFront CDN uses the supplied header to serve assets
     * so if the correct Content-Type is not provided browsers ignore some assets
     **/
    var contentTypeFor = function (filename) {
        var extension = filename.substr(filename.lastIndexOf('.') + 1);

        var extensionContentTypeMap = {
            css: 'text/css',
            js: 'application/javascript',
            png: 'image/png',
            jpg: 'image/jpeg',
            svg: 'image/svg+xml',
            jpeg: 'image/jpeg'
        };

        if (extensionContentTypeMap.hasOwnProperty(extension)) {
            return extensionContentTypeMap[extension];
        }

        return 'application/octet-stream';
    };

    globfs("**/*", {cwd: config.distDir, nodir: true}, function (err, files) {
        if (err) {
            throw err;
        }

        var finished = 0;

        var monthFromNow = new Date();
        monthFromNow.setMonth(monthFromNow.getMonth() + 1);

        files.forEach(function (file) {
            s3.putObject({
                Bucket: config.s3Bucket,
                Key: s3KeyFor(file),
                Body: fs.createReadStream(config.distDir + '/' + file),
                ContentType: contentTypeFor(file),
                CacheControl: 'public,max-age=2592000',
                Expires: monthFromNow
            }, function (err, result) {
                if (err) {
                    throw new Error(err);
                }

                finished++;
                if (files.length === finished) {
                    cb();
                }
            });
        });
    });
}

function rebuildMwpIcons(cb) {
    var iconsPath = config.srcDir + '/styles/fonts/MwpIcons';
    var iconsStyle = iconsPath + '/_icons.scss';

    // replace url('... with font-url('MwpIcons/...
    var iconsStyleContents = fs.readFileSync(iconsStyle, {encoding: 'utf8'});
    iconsStyleContents = iconsStyleContents.replace(/url\('/g, "url('/styles/fonts/MwpIcons/");
    fs.writeFileSync(iconsStyle, iconsStyleContents);

    // extract icon classes
    var classes = iconsStyleContents.match(/\.fa\-([^:]+)/g);
    var icons = [];
    for (var i = 0; i < classes.length; i++) {
        var clazz = classes[i];
        var matches = clazz.match(/\.fa\-([^:]+)$/);
        icons.push({class: matches[1]});
    }

    // Replace elements ctrl icons shown
    var elementsCtrlPathname = 'app/scripts/dashboard/controllers/ElementsCtrl.js';
    var elementsCtrl = fs.readFileSync(elementsCtrlPathname, {encoding: 'utf8'});
    elementsCtrl = elementsCtrl.replace(/\$scope\.icons[^;]+;/, '$scope.icons = ' + JSON.stringify(icons) + ';');
    fs.writeFileSync(elementsCtrlPathname, elementsCtrl);

    var iconsCtrlPath = 'app/scripts/dashboard/development-guide/StyleGuideIconsCtrl.js';
    var iconsCtrl = fs.readFileSync(iconsCtrlPath, {encoding: 'utf8'});
    iconsCtrl = iconsCtrl.replace(/\$scope\.icons[^;]+;/, '$scope.icons = ' + JSON.stringify(icons) + ';');
    fs.writeFileSync(iconsCtrlPath, iconsCtrl);

    iconsStyleContents = iconsStyleContents.replace(/\.fa/, '@import "core";\n@import "spinning";\n\n.fa');
    fs.writeFileSync(iconsStyle, iconsStyleContents);
    cb();
}

function copyBowerCss() {
    return gulp.src([
        config.srcDir + '/bower_components/angular-ui-select/dist/select.css',
        config.srcDir + '/bower_components/ng-sortable/dist/ng-sortable.css',
        config.srcDir + '/bower_components/godaddy-pro-header/build/godaddy-pro-header.css'
    ]).pipe(gulp.dest(config.tmpDir + '/styles'));
}

function copyBowerCssDev() {
    return gulp.src([
        config.srcDir + '/bower_components/angular-ui-select/dist/select.css',
        config.srcDir + '/bower_components/ng-sortable/dist/ng-sortable.css',
        config.srcDir + '/bower_components/godaddy-pro-header/build/godaddy-pro-header.css'
    ]).pipe(gulp.dest(config.distDir + '/styles'));
}

gulp.task(rebuildMwpIcons);

gulp.task('default',
    gulp.series(
        clean,
        cleanApiDashboardPath,
        copyBowerCssDev,
        gulp.parallel(
            buildTemplateDev,
            buildCssDev,
            buildHtmlDev
        ),
        gulp.parallel(
            liveReload,
            watchProject,
            signalReady /*,
             runInitialLint */
        )
    )
);

gulp.task('build',
    gulp.series(
        clean,
        cleanTmp,
        cleanApiDashboardPath,
        gulp.parallel(
            copyBowerCss,
            optimizeAssets
        ),
        gulp.parallel(
            copyStaticAssets,
            buildTemplate,
            buildCss
        ),
        buildHtml,
        cleanTmp
    )
);

// Used to test local production builds
gulp.task('build-locally',
    gulp.series(
        'build',
        rewriteHostBase
    )
);

gulp.task('build-cdn', gulp.series(assertCdnConfig, 'build', switchToCdn));

gulp.task('lint', runFullLint);
