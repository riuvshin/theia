/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import { expect } from 'chai';
import { Container, interfaces } from 'inversify';
import { DugiteGit } from './dugite-git';
import { git as gitExec } from 'dugite-extra/lib/core/git';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { WorkingDirectoryStatus, Repository, GitUtils, GitFileStatus } from '../common';
import { initRepository, createTestRepository } from 'dugite-extra/lib/command/test-helper';
import { bindGit } from './git-backend-module';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { ILoggerServer } from '@theia/core/lib/common/logger-protocol';
import { ConsoleLoggerServer } from '@theia/core/lib/common/console-logger-server';
import { MockRepositoryManager } from './test/mock-repository-manager';
import { MockRepositoryWatcher } from './test/mock-repository-watcher';

// tslint:disable:no-unused-expression

const track = temp.track();

describe('git', async function () {

    this.timeout(10000);

    after(async () => {
        track.cleanupSync();
    });

    describe('repositories', async () => {

        it('should discover only first repository', async () => {

            const root = track.mkdirSync('discovery-test-1');
            fs.mkdirSync(path.join(root, 'A'));
            fs.mkdirSync(path.join(root, 'B'));
            fs.mkdirSync(path.join(root, 'C'));
            await initRepository(path.join(root, 'A'));
            await initRepository(path.join(root, 'B'));
            await initRepository(path.join(root, 'C'));
            const git = await createGit();
            const workspaceRootUri = FileUri.create(root).toString();
            const repositories = await git.repositories(workspaceRootUri, { maxCount: 1 });
            expect(repositories.length).to.deep.equal(1);

        });

        it('should discover all nested repositories', async () => {

            const root = track.mkdirSync('discovery-test-1');
            fs.mkdirSync(path.join(root, 'A'));
            fs.mkdirSync(path.join(root, 'B'));
            fs.mkdirSync(path.join(root, 'C'));
            await initRepository(path.join(root, 'A'));
            await initRepository(path.join(root, 'B'));
            await initRepository(path.join(root, 'C'));
            const git = await createGit();
            const workspaceRootUri = FileUri.create(root).toString();
            const repositories = await git.repositories(workspaceRootUri, {});
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'C']);

        });

        it('should discover all nested repositories and the root repository which is at the workspace root', async () => {

            const root = track.mkdirSync('discovery-test-2');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'C'));
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'A'));
            await initRepository(path.join(root, 'BASE', 'B'));
            await initRepository(path.join(root, 'BASE', 'C'));
            const git = await createGit();
            const workspaceRootUri = FileUri.create(path.join(root, 'BASE')).toString();
            const repositories = await git.repositories(workspaceRootUri, {});
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'BASE', 'C']);

        });

        it('should discover all nested repositories and the container repository', async () => {

            const root = track.mkdirSync('discovery-test-3');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            const git = await createGit();
            const workspaceRootUri = FileUri.create(path.join(root, 'BASE', 'WS_ROOT')).toString();
            const repositories = await git.repositories(workspaceRootUri, {});
            const repositoryNames = repositories.map(r => path.basename(FileUri.fsPath(r.localUri)));
            expect(repositoryNames.shift()).to.equal('BASE'); // The first must be the container repository.
            expect(repositoryNames.sort()).to.deep.equal(['A', 'B', 'C']);

        });

    });

    describe('status', async () => {

        it('modifying a staged file should result in two changes', async () => {

            // Init repository.
            const root = await createTestRepository(track.mkdirSync('status-test'));
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            const git = await createGit();

            // // Check status. Expect empty.
            let status = await git.status(repository);
            expect(status.changes).to.be.empty;

            // Modify a file.
            const filePath = path.join(root, 'A.txt');
            const fileUri = FileUri.create(filePath).toString();
            fs.writeFileSync(filePath, 'new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('new content');
            await git.add(repository, fileUri);

            // Check the status again. Expect one single change.
            status = await git.status(repository);
            expect(status.changes).to.be.have.lengthOf(1);
            expect(status.changes[0].uri).to.be.equal(fileUri);
            expect(status.changes[0].staged).to.be.true;

            // Change the same file again.
            fs.writeFileSync(filePath, 'yet another new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('yet another new content');

            // We expect two changes; one is staged, the other is in the working directory.
            status = await git.status(repository);
            expect(status.changes).to.be.have.lengthOf(2);
            expect(status.changes.map(f => f.uri)).to.be.deep.equal([fileUri, fileUri]);
            expect(status.changes.map(f => f.staged).sort()).to.be.deep.equal([false, true]);

        });

    });

    describe('WorkingDirectoryStatus#equals', async () => {

        it('staged change should matter', async () => {

            const left: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":false
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            const right: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":true
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            expect(WorkingDirectoryStatus.equals(left, right)).to.be.false;

        });

    });

    describe('show', async () => {

        let repository: Repository | undefined;
        let git: DugiteGit | undefined;

        beforeEach(async () => {
            const root = await createTestRepository(track.mkdirSync('status-test'));
            const localUri = FileUri.create(root).toString();
            repository = { localUri };
            git = await createGit();
        });

        it('modified in working directory', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            const content = await git!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'HEAD' });
            expect(content).to.be.equal('A');
        });

        it('modified in working directory (nested)', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'folder', 'C.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'folder', 'C.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            const content = await git!.show(repository!, FileUri.create(path.join(repositoryPath, 'folder', 'C.txt')).toString(), { commitish: 'HEAD' });
            expect(content).to.be.equal('C');
        });

        it('modified in index', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            await git!.add(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString());
            const content = await git!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'index' });
            expect(content).to.be.equal('new content');
        });

        it('modified in index and in working directory', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            await git!.add(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString());
            expect(await git!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'index' })).to.be.equal('new content');
            expect(await git!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'HEAD' })).to.be.equal('A');
        });

    });

    describe('remote', async () => {

        it('remotes are not set by default', async () => {
            const root = track.mkdirSync('remote-with-init');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);
            const git = await createGit();
            const remotes = await git.remote({ localUri });
            expect(remotes).to.be.empty;
        });

        it('origin is the default after a fresh clone', async () => {
            const git = await createGit();
            const remoteUrl = 'https://github.com/TypeFox/find-git-exec.git';
            const localUri = FileUri.create(track.mkdirSync('remote-with-clone')).toString();
            const options = { localUri };
            await git.clone(remoteUrl, options);

            const remotes = await git.remote({ localUri });
            expect(remotes).to.be.lengthOf(1);
            expect(remotes.shift()).to.be.equal('origin');
        });

        it('remotes can be added and queried', async () => {
            const root = track.mkdirSync('remote-with-init');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            await gitExec(['remote', 'add', 'first', 'some/location'], root, 'addRemote');
            await gitExec(['remote', 'add', 'second', 'some/location'], root, 'addRemote');

            const git = await createGit();
            const remotes = await git.remote({ localUri });
            expect(remotes).to.be.deep.equal(['first', 'second']);
        });

    });

    describe('exec', async () => {

        it('version', async () => {
            const root = track.mkdirSync('exec-version');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            const git = await createGit();
            const result = await git.exec({ localUri }, ['--version']);
            expect(result.stdout.trim().replace(/^git version /, '').startsWith('2')).to.be.true;
            expect(result.stderr.trim()).to.be.empty;
            expect(result.exitCode).to.be.equal(0);
        });

        it('config', async () => {
            const root = track.mkdirSync('exec-config');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            const git = await createGit();
            const result = await git.exec({ localUri }, ['config', '-l']);
            expect(result.stdout.trim()).to.be.not.empty;
            expect(result.stderr.trim()).to.be.empty;
            expect(result.exitCode).to.be.equal(0);
        });

    });

    describe('map-status', async () => {

        it('deleted', () => {
            expect(GitUtils.mapStatus('D')).to.be.equal(GitFileStatus.Deleted);
        });

        it('added with leading whitespace', () => {
            expect(GitUtils.mapStatus(' A')).to.be.equal(GitFileStatus.New);
        });

        it('modified with trailing whitespace', () => {
            expect(GitUtils.mapStatus('M ')).to.be.equal(GitFileStatus.Modified);
        });

        it('copied with percentage', () => {
            expect(GitUtils.mapStatus('C100')).to.be.equal(GitFileStatus.Copied);
        });

        it('renamed with percentage', () => {
            expect(GitUtils.mapStatus('R10')).to.be.equal(GitFileStatus.Renamed);
        });

    });

});

async function createGit(): Promise<DugiteGit> {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    container.rebind(ILoggerServer).to(ConsoleLoggerServer).inSingletonScope();
    bindGit(bind, {
        bindManager(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(MockRepositoryManager).inSingletonScope();
        },
        bindWatcher(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(MockRepositoryWatcher);
        }
    });
    return container.get(DugiteGit);
}
