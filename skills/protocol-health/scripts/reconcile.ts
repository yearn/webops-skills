import {Cache} from './io';
import {collectDelta} from './reuse';
import {support} from './collect-support';
import {prepareVaults} from './prepare-vaults';
import {auditBlocks} from './block-audit';
import {observations} from './vault-observations';
import {normalizeVaults} from './normalize-vaults';
import {collectFeeMints} from './fee-mints';
import {feeRouting} from './fee-routing';
import {reconcileFees} from './reconcile-fees';
import {refreshTreasury} from './refresh-treasury';
import {ledger} from './ledger';
import {costsFromCache} from './financial-reuse';
import {nativeDelta} from './native-delta';
import {assemble} from './assemble';
// Agent-reviewed import inventory and budget approvals are prerequisites, never inferred from token names.
export async function reconcile(output:string,cache:Cache){
 await collectDelta(output,cache);
 await support(output,cache);
 await prepareVaults(output,cache);
 await auditBlocks(output,cache);
 await observations(output,cache);
 await normalizeVaults(output,cache);
 await collectFeeMints(output,cache);
 await reconcileFees(output,cache); // Bootstrap recipient candidates, then verify routes.
 await feeRouting(output,cache);
 await reconcileFees(output,cache);
 await refreshTreasury(output,cache);
 await ledger(output,cache);
 await nativeDelta(output,cache);
 await costsFromCache(output,cache);
 await assemble(output,cache);
}
