import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Bundle } from '@devvit/protos/types/devvit/plugin/buildpack/buildpack_common.js';
import { ActorSpec, TargetRuntime } from '@devvit/protos/types/devvit/runtime/bundle.js';
import { Args } from '@oclif/core';

import { getAccessToken } from '../../util/auth.js';
import { Bundler } from '../../util/Bundler.js';
import { toLowerCaseArgParser } from '../../util/commands/DevvitCommand.js';
import { ProjectCommand } from '../../util/commands/ProjectCommand.js';
import { distDirFilename } from '../../util/config.js';
import { readDevvitConfig } from '../../util/devvitConfig.js';
import { readAndInjectBundleProducts } from '../../util/payments/paymentsConfig.js';

export default class BundleActor extends ProjectCommand {
  static override description = 'Bundle an actor into bundle.json';

  static override examples = ['$ devvit bundle actor my-actor'];

  static override args = {
    name: Args.string({
      description: 'The name of of the actor to bundle',
      required: false,
      parse: toLowerCaseArgParser,
      default: 'main',
    }),
  };

  static override hidden = true;

  async run(): Promise<void> {
    const { args } = await this.parse(BundleActor);

    const username = await this.#getOwnerUsername();
    const config = await readDevvitConfig(this.projectRoot, this.configFile);

    const actorSpec = ActorSpec.fromPartial({
      name: args.name,
      owner: username,
      version: config.version,
    });

    await this.#makeBundles(actorSpec);

    this.log(`Successfully bundled actor: ${actorSpec.name}`);
  }

  async #makeBundles(actorSpec: ActorSpec): Promise<void> {
    const actorBundler = new Bundler();

    const bundles = await actorBundler.bundle(this.projectRoot, actorSpec);

    await Promise.all(
      bundles.map(async (bundle) => {
        const target = bundle.buildInfo?.targetRuntime ?? TargetRuntime.UNIVERSAL;
        let type = '';
        if (target === TargetRuntime.CLIENT) {
          type = '.client';
        }
        await readAndInjectBundleProducts(this.projectRoot, bundle, false);

        await mkdir(path.join(this.projectRoot, distDirFilename), { recursive: true });
        await writeFile(
          path.join(this.projectRoot, distDirFilename, `${actorSpec.name}.bundle${type}.json`),
          JSON.stringify(Bundle.toJSON(bundle))
        );
      })
    );
  }

  async #getOwnerUsername(): Promise<string> {
    let username = '';

    try {
      const token = await getAccessToken();
      if (token) {
        username = await this.getUserDisplayName(token);
      }
    } catch {
      // Username is unavailable.
    }

    if (!username) {
      this.warn(`You are not logged in: setting "username" as empty`);
    }

    return username;
  }
}
