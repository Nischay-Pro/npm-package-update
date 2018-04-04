const appPath = require('app-root-dir').get();
const fs = require('fs');
const mkdirp = require('mkdirp');
const https = require('follow-redirects').https;
const path = require('path');
const Promise = require('bluebird');
const exec = require('child_process').exec;

module.exports = (robot) => {
	robot.on(['pull_request.opened', 'pull_request.reopened'], receive);
	async function receive(context) {
		// Get all issues for repo with user as creator
		try {
			const files = await context.github.pullRequests.getFiles(context.issue());
			let process = [];
			files.data.every(element => {
				if (element.filename == 'package.json') {
					process.push(downloadFile(context, element, robot));
				} else if (element.filename == 'yarn.lock') {
					process.push(downloadFile(context, element, robot));
				}
				if (process.length == 2)
					return false;
				else return true;
			});
			if (process.length !== 0) {
				Promise.all(process).then(result => {
					let pathDirectory = '';
					if (result.length == 1) {
						robot.log('Warning missing yarn.lock file. Will attempt to generate lockfile.');
						pathDirectory = path.join(appPath, 'tmp', context.repo().owner, context.repo().repo, context.issue().number.toString(), result.path);
					} else {
						robot.log('Processing Yarn Lockfile and Package.json.');
						pathDirectory = path.join(appPath, 'tmp', context.repo().owner, context.repo().repo, context.issue().number.toString(), result[0].path);
					}
					exec('yarn install', {
						cwd: pathDirectory
					}, (err, stdout, stderr) => {
						if (err != undefined && err != null) {
							robot.log(`Error1a: ${err}`);
							return;
						}
						if (stderr.length > 0) {
							robot.log(`Error1b: ${stderr}`);
							return;
						}
						robot.log('Checking for outdated packages');
						exec('yarn outdated', {
							cwd: pathDirectory
						}, (err2, stdout2, stderr2) => {
							if (err2.length != undefined) {
								robot.log(`Error2a: ${err2}`);
								return;
							} else if (stderr2.length > 0) {
								robot.log(`Error2b: ${stderr2}`);
								return;
							} else if (stdout2.toString().includes('info Color legend :')) {
								const matcher = new RegExp('(Package)([\\S\\s]*)(?=Done in)');
								let result = matcher.exec(stdout2);
								robot.log('Found outdated packages');
								let packages = result[0].split(/\r?\n/);
								packages.shift();
								packages.pop();
								let packagelist = [];
								packages.forEach(element => {
									let data = element.replace(/  +/g, ' ');
									data = data.split(' ');
									let stuff = {
										name: data[0],
										installed: data[1],
										wanted: data[2],
										latest: data[3],
										type: data[4],
										url: `[${data[0]}](${data[5]})`
									};
									packagelist.push(stuff);
								});
								let val = '';
								val += `We found **${packagelist.length}** outdated package(s) in this Pull Request.\r\n\r\n`;
								val += arrayToTable(packagelist, ['Name of Package', 'Version Installed', 'Version Wanted', 'Latest Version', 'Type of Package', 'URL'], 'center');
								val += '\r\n If you would like the bot to **create a commit** with the **updated** packages, comment `\\update packages` in this Pull Request.';
								context.github.issues.createComment(context.issue({
									body: val
								}));
								robot.log('Posted on GitHub');
							} else {
								robot.log('Yaay! Everything is up to date. :clap:');
								context.github.issues.createComment(context.issue({
									body: 'Yaay! Everything is up to date. :clap:'
								}));
							}
						});
					});
				}).catch((err) => {
					robot.log(err);
				});
			} else {
				robot.log('Did not detect yarn.lock / package.json file');
			}
		} catch (err) {
			if (err.code !== 404) {
				throw err;
			}
		}
	}
};

const downloadFile = (context, element, robot) => {
	return new Promise((resolve, reject) => {
		try {
			let dir = element.filename.substr(0, element.filename.lastIndexOf('/'));
			let file = {
				name: path.basename(element.filename),
				path: dir,
				url: element.raw_url
			};
			mkdirp.sync(path.join(appPath, 'tmp', context.repo().owner, context.repo().repo, context.issue().number.toString(), file.path));
			robot.log(`Downloading file: ${file.name}`);
			let makefile = fs.createWriteStream(path.join('tmp', context.repo().owner, context.repo().repo, context.issue().number.toString(), file.path, file.name));
			https.get(file.url, function (response) {
				response.pipe(makefile);
			});
			makefile.on('finish', () => {
				robot.log(`Downloaded file: ${file.name}`);
				resolve(file);
			});
		} catch (err) {
			reject(err);
		}
	});
};

function arrayToTable(array, columns, alignment = 'center') {
	let table = '';
	let separator = {
		'left': ':---',
		'right': '---:',
		'center': '---'
	};

	let cols = columns;

	table += cols.join(' | ');
	table += '\r\n';

	table += cols.map(function () {
		return separator[alignment] || separator.center;
	}).join(' | ');
	table += '\r\n';

	array.forEach((item) => {
		let result = [];
		for (let key in item) {
			result.push(item[key]);
		}
		table += result.join(' | ') + '\r\n';
	});
	return table;
}