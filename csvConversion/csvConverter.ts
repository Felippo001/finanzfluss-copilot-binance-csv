

export type BinanceCSVRawJsonEntry = {
    'Date(UTC)': string,
    OrderNo: string,
    Pair: string,
    Type: string,
    Side: 'BUY' | 'SELL',
    'Order Price': string,
    'Order Amount': string,
    Time: string,
    Executed: string,
    'Average Price': string,
    'Trading total': string,
    Status: 'FILLED' | 'CANCELED'
}

export type Transaktion = 'Kauf' | 'Verkauf' | 'Einbuchung' | 'Ausbuchung' | 'Kupon' | 'Dividende' | undefined
export type CopilotCsvJsonEntry = {
    Datum: string,
    ISIN: string,
    Name: string,
    Typ: 'Fremdwährung',
    Transaktion: Transaktion
    Preis: number,
    Anzahl: number,
    'Gebühren': number,
    Steuern: number,
    'Währung': string,
    Wechselkurs: number
}


export async function convertBinanceCsv(jsonCsvArray : BinanceCSVRawJsonEntry[]) {
    const filtered = jsonCsvArray.filter(a => a.Status == 'FILLED')
    const copilotCsvArray : CopilotCsvJsonEntry[] = []

    for(const entry of filtered) {
        const copilotEntry = {} as CopilotCsvJsonEntry

        const date = new Date(entry.Time)
        copilotEntry.Datum = formatDateString(date.toLocaleDateString())
        const currencyName = extractNumberAndWord(entry.Executed)?.[1]
        copilotEntry.ISIN = currencyName!
        copilotEntry.Name = currencyName!
        copilotEntry.Typ = 'Fremdwährung'
        copilotEntry.Transaktion = entry.Side == 'BUY' ? 'Kauf' : (entry.Side == 'SELL' ? 'Verkauf' : undefined)

        if(copilotEntry.Transaktion == undefined){
            console.error(`Invalid transaction side ${entry.Side}. Only accepting BUY and SELL. This entry will be ignored`)
            continue
        }

        copilotEntry.Preis = parseFloat(entry["Average Price"])
        copilotEntry.Anzahl = parseFloat(
            extractNumberAndWord(entry["Order Amount"])?.[0]!
        )
        copilotEntry["Gebühren"] = 0
        copilotEntry.Steuern = 0
        const currency = extractNumberAndWord(entry["Trading total"])?.[1]!
        const c = currency.includes('USD') ? 'USD' : currency

            
        copilotEntry["Währung"] = c // c
        if(c != "EUR" && c != "USD") {
            const [orderAmount, orderAmountCurrency] = extractNumberAndWord(entry.Executed)!
            const [tradingAmount, tradingAmountCurrency] = extractNumberAndWord(entry["Trading total"])!

            const usdInCurrencyX = await historicalUSDPriceConversion(date, orderAmountCurrency) // e.g 1 USD = 0.1594DOT
            const priceX = 1 / usdInCurrencyX // e.g 1 DOT = 6.5 USD

            const totalUSDX = priceX * parseFloat(orderAmount)

            const priceY = totalUSDX / parseFloat(tradingAmount)
            const wechselkurs = await historicalUSDPriceConversion(date, "EUR")

            const sideX = entry.Side == "BUY" ? "Kauf" : "Verkauf"
            const sideY = sideX == "Kauf" ? "Verkauf" : "Kauf"

            copilotCsvArray.push(
                // X to USD
                {
                    Datum: formatDateString(date.toLocaleDateString()),
                    ISIN: orderAmountCurrency!,
                    Name: orderAmountCurrency!,
                    Typ: 'Fremdwährung',
                    Transaktion: sideX,
                    Preis: priceX,
                    Anzahl: parseFloat(orderAmount),
                    Gebühren: 0,
                    Steuern: 0,
                    Währung: "USD",
                    Wechselkurs: wechselkurs

                },
                // USD to Y
                {
                    Datum: formatDateString(date.toLocaleDateString()),
                    ISIN: tradingAmountCurrency!,
                    Name: tradingAmountCurrency!,
                    Typ: 'Fremdwährung',
                    Transaktion: sideY,
                    Preis: priceY,
                    Anzahl: parseFloat(tradingAmount),
                    Gebühren: 0,
                    Steuern: 0,
                    Währung: "USD",
                    Wechselkurs: wechselkurs

                }
            )
            continue
        }

        copilotEntry.Wechselkurs = copilotEntry.Währung == 'EUR' ? 1 : await historicalUSDPriceConversion(date, "EUR")
        
        copilotCsvArray.push(copilotEntry)
    }


    return copilotCsvArray
}

function extractNumberAndWord(input : string) : [string, string] | null {
    const match = input.match(/^([\d.]+)([a-zA-Z]+)$/);
    if (match) {
        // match[1] contains the number as a string
        // match[2] contains the word
        return [match[1], match[2]];
    }
    return null; // Return null if the match doesn't work
}

function formatDateString(inputDate : string) {
    // Split the input date using '.' as the delimiter
    const parts = inputDate.split('.');

    // Ensure the day, month, and year are extracted correctly
    let [day, month, year] = parts;

    // Pad day and month with leading zeros if necessary
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

    // Return the formatted date in DD.MM.YYYY format
    return `${day}.${month}.${year}`;
}

async function historicalUSDPriceConversion(date: Date, targetCurrency : string) {
    const apiKey = Deno.env.get('CRYPTO_COMPARE_API_KEY')

    if(!apiKey) {
        console.error("No api key set for historical price api. Using a default of one")
        return 1
    }
    
    const USDPairs = ["USDT", "USDC", "BUSD", "FDUSD", "TUSD"].map(a => [`${a}-${targetCurrency}`, `${targetCurrency}-${a}`]).flat()
    let json : any

    try {
        for(const pair of USDPairs){
            let url = `https://data-api.ccdata.io/spot/v1/historical/days?market=binance&instrument=${pair}&limit=1&aggregate=1&fill=false&apply_mapping=true&response_format=JSON&to_ts=${date.getTime()/1000}&api_key=${apiKey}`
            let response = await fetch(url)
            if(response.ok){
                json = await response.json()
                break;
            }

        }
    } catch (error) {
        
    }

    // const response = await fetch(url)
    // const json = await response.json()
    console.log(json)
    if(!json) {
        console.error("Could not find any pair for ", USDPairs)
        console.error("Return 1 as default")
        return 1;
    }

    return 1 / ((json.Data[0].HIGH + json.Data[0].LOW) / 2)
}