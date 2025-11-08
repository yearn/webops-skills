#!/usr/bin/env bun

import { createPublicClient, http, type Address, type PublicClient } from 'viem'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from repo root (two levels up from this script's directory)
// import.meta.dir is always the directory containing this script file
const scriptDir = import.meta.dir || dirname(fileURLToPath(import.meta.url))
const envPath = resolve(scriptDir, '../../.env')
config({ path: envPath })

interface FindCreateBlockResult {
  chainId: number
  address: Address
  createBlock: bigint | null
  confidence: 'exact' | 'estimated' | 'not_found'
  method: 'rpc-binary-search'
  blocksSearched: number
}

async function hasCode(
  client: PublicClient,
  address: Address,
  blockNumber: bigint
): Promise<boolean> {
  try {
    const code = await client.getCode({
      address,
      blockNumber
    })
    return code !== undefined && code !== '0x'
  } catch (error) {
    // Block may not exist or RPC doesn't support historical queries
    return false
  }
}

async function findCreateBlock(
  chainId: number,
  address: Address
): Promise<FindCreateBlockResult> {
  // Get archive node RPC URL from environment
  const rpcUrl = process.env[`ARCHIVE_NODE_${chainId}`]
  if (!rpcUrl) {
    throw new Error(
      `No archive node RPC URL configured for chain ${chainId}. Add ARCHIVE_NODE_${chainId} to .env file.`
    )
  }

  // Create viem client
  const client = createPublicClient({
    transport: http(rpcUrl)
  })

  // Get current block number
  const currentBlock = await client.getBlockNumber()

  // Check if contract exists at current block
  const currentHasCode = await hasCode(client, address, currentBlock)
  if (!currentHasCode) {
    return {
      chainId,
      address,
      createBlock: null,
      confidence: 'not_found',
      method: 'rpc-binary-search',
      blocksSearched: 1
    }
  }

  // Binary search for first block with code
  let low = 0n
  let high = currentBlock
  let blocksSearched = 1 // Already checked current block
  let firstBlockWithCode: bigint | null = null

  while (low <= high) {
    const mid = (low + high) / 2n
    blocksSearched++

    const midHasCode = await hasCode(client, address, mid)

    if (midHasCode) {
      firstBlockWithCode = mid
      high = mid - 1n // Search earlier blocks
    } else {
      low = mid + 1n // Search later blocks
    }
  }

  // Verify we found the exact block by checking block before it
  if (firstBlockWithCode !== null && firstBlockWithCode > 0n) {
    blocksSearched++
    const prevBlockHasCode = await hasCode(client, address, firstBlockWithCode - 1n)

    return {
      chainId,
      address,
      createBlock: firstBlockWithCode,
      confidence: prevBlockHasCode ? 'estimated' : 'exact',
      method: 'rpc-binary-search',
      blocksSearched
    }
  }

  return {
    chainId,
    address,
    createBlock: firstBlockWithCode,
    confidence: firstBlockWithCode !== null ? 'exact' : 'not_found',
    method: 'rpc-binary-search',
    blocksSearched
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: bun run find-create-block.ts <chainId> <address>')
    console.error('Example: bun run find-create-block.ts 1 0x1234567890123456789012345678901234567890')
    process.exit(1)
  }

  const chainId = parseInt(args[0])
  const address = args[1] as Address

  if (isNaN(chainId)) {
    console.error('Error: chainId must be a number')
    process.exit(1)
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    console.error('Error: address must be a valid Ethereum address (0x...)')
    process.exit(1)
  }

  try {
    console.error(`Searching for creation block of ${address} on chain ${chainId}...`)
    const result = await findCreateBlock(chainId, address)

    // Output JSON result to stdout
    console.log(JSON.stringify({
      ...result,
      createBlock: result.createBlock?.toString() ?? null
    }, null, 2))

    if (result.createBlock !== null) {
      console.error(`✓ Found! Block ${result.createBlock} (searched ${result.blocksSearched} blocks)`)
    } else {
      console.error(`✗ Contract not found on chain ${chainId}`)
      process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
