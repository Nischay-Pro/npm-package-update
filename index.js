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
					if (result.length == 1) {
						robot.log('Warning missing yarn.lock file. Will attempt to generate it.');
						exec('yarn install', {
							cwd: path.join('tmp', context.repo().owner, context.repo().repo, result.path)
						}, (err, stdout, stderr) => {
							if (err) {
								robot.log('Failed');
								robot.log(err);
								return;
							}
							robot.log(`stdout: ${stdout}`);
							robot.log(`stderr: ${stderr}`);
							robot.log('Checking for outdated packages');
							exec('yarn outdated', {
								cwd: path.join('tmp', context.repo().owner, context.repo().repo, result.path)
							}, (err, stdout, stderr) => {
								if (err) {
									robot.log('Failed');
									robot.log(err);
									return;
								}
								robot.log(`stdout: ${stdout}`);
								robot.log(`stderr: ${stderr}`);
							});
						});
					} else {
						robot.log('Processing Yarn Lockfile and Package.json.');
						exec('yarn install', {
							cwd: path.join('tmp', context.repo().owner, context.repo().repo, result[0].path)
						}, (err, stdout, stderr) => {
							if (err) {
								robot.log('Failed');
								robot.log(err);
								return;
							}
							robot.log(`stdout: ${stdout}`);
							robot.log(`stderr: ${stderr}`);
							robot.log('Checking for outdated packages');
							exec('yarn outdated', {
								cwd: path.join('tmp', context.repo().owner, context.repo().repo, result[0].path)
							}, (err, stdout, stderr) => {
								if (err) {
									robot.log('Failed');
									robot.log(err);
									return;
								}
								robot.log(`stdout: ${stdout}`);
								robot.log(`stderr: ${stderr}`);
							});
						});
					}
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
			mkdirp.sync(path.join(appPath, 'tmp', context.repo().owner, context.repo().repo, file.path));
			robot.log(`Downloading file: ${file.name}`);
			let makefile = fs.createWriteStream(path.join('tmp', context.repo().owner, context.repo().repo, file.path, file.name));
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