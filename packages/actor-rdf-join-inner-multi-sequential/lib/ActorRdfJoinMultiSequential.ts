import {
  ActorQueryOperation,
} from '@comunica/bus-query-operation';
import type {
  IActionRdfJoin,
  IActorRdfJoinOutputInner,
  IActorRdfJoinArgs,
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import { ActorRdfJoin } from '@comunica/bus-rdf-join';
import { KeysInitQuery } from '@comunica/context-entries';
import type { TestResult } from '@comunica/core';
import { passTest } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type { MetadataBindings, IJoinEntry, ComunicaDataFactory } from '@comunica/types';
import { Factory } from 'sparqlalgebrajs';

/**
 * A Multi Sequential RDF Join Actor.
 * It accepts 3 or more streams, joins the first two, and joins the result with the remaining streams.
 */
export class ActorRdfJoinMultiSequential extends ActorRdfJoin {
  public readonly mediatorJoin: MediatorRdfJoin;

  public constructor(args: IActorRdfJoinMultiSequentialArgs) {
    super(args, {
      logicalType: 'inner',
      physicalName: 'multi-sequential',
      limitEntries: 3,
      limitEntriesMin: true,
      canHandleUndefs: true,
      isLeaf: false,
    });
  }

  protected async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new Factory(dataFactory);

    // Join the two first streams, and then join the result with the remaining streams
    const firstEntry: IJoinEntry = {
      output: ActorQueryOperation.getSafeBindings(await this.mediatorJoin
        .mediate({ type: action.type, entries: [ action.entries[0], action.entries[1] ], context: action.context })),
      operation: algebraFactory
        .createJoin([ action.entries[0].operation, action.entries[1].operation ], false),
    };
    const remainingEntries: IJoinEntry[] = action.entries.slice(1);
    remainingEntries[0] = firstEntry;
    return {
      result: await this.mediatorJoin.mediate({
        type: action.type,
        entries: remainingEntries,
        context: action.context,
      }),
    };
  }

  protected async getJoinCoefficients(
    action: IActionRdfJoin,
    metadatas: MetadataBindings[],
  ): Promise<TestResult<IMediatorTypeJoinCoefficients>> {
    const requestInitialTimes = ActorRdfJoin.getRequestInitialTimes(metadatas);
    const requestItemTimes = ActorRdfJoin.getRequestItemTimes(metadatas);
    return passTest({
      iterations: metadatas[0].cardinality.value * metadatas[1].cardinality.value *
        metadatas.slice(2).reduce((acc, metadata) => acc * metadata.cardinality.value, 1),
      persistedItems: 0,
      blockingItems: 0,
      requestTime: requestInitialTimes[0] + metadatas[0].cardinality.value * requestItemTimes[0] +
        requestInitialTimes[1] + metadatas[1].cardinality.value * requestItemTimes[1] +
        metadatas.slice(2)
          .reduce((sum, metadata, i) => sum + requestInitialTimes[i] +
            metadata.cardinality.value * requestItemTimes[i], 0),
    });
  }
}

export interface IActorRdfJoinMultiSequentialArgs extends IActorRdfJoinArgs {
  /**
   * A mediator for joining Bindings streams
   */
  mediatorJoin: MediatorRdfJoin;
}
