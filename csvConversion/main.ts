import * as csv from 'npm:csvtojson'
import { mkConfig, generateCsv } from 'npm:export-to-csv'
import {convertBinanceCsv} from './csvConverter.ts'

import { writeFileSync } from "node:fs";


if (import.meta.main) {
  const jsonArray =  await csv.default().fromFile('./binance.csv')

  const converted = await convertBinanceCsv(jsonArray)

  const csvConfig = mkConfig({ useKeysAsHeaders: true, fieldSeparator: ";", quoteStrings: false, decimalSeparator: "," });
  const csvString = generateCsv(csvConfig)(converted);

  const filename = `${csvConfig.filename}4.csv`;


  writeFileSync(filename, csvString as any);

  
}


