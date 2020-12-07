var express = require("express");
const axios = require('axios').default;
const neo4j = require('neo4j-driver');
const execSync  = require("child_process").execSync;
const { exec }  = require("child_process");
var bodyParser = require('body-parser');
var crypto = require('crypto');


var csv = require('csv-parser');
var fs = require('fs');

var user = 'admin'
var password = 'admin'
var uri = 'neo4j://localhost'

var app = express();
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
const session = getNeo4jSession();

function getNeo4jSession() {
    return driver.session({ database: 'comp5118', defaultAccessMode: neo4j.session.WRITE });
}


app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get("/", (req, res, next) => {
    res.json({ "message": "Welcome to COMP5118s Backend" })
});
app.get("/initLang", (req, res, next) => {
    initLanguagesFromCSV(res)
});
app.get("/initContinents", (req, res, next) => {
    initContinentsFromCSV(res)
});
app.get("/initCountries", (req, res, next) => {
    initCountriesFromCSV(res)
});
app.get("/initContinentLinking", (req, res, next) => {
    initCountryContinentLinking(res)
});
app.get("/initOfficialLanguageLinking", (req, res, next) => {
    initOfficialLanguageLinking(res)
});
app.get("/init", (req, res, next) => {
    return fetchAll(res);
});
app.get('/api', (req, res, next) => {
    var endpoint = 'https://www.wikidata.org/w/api.php';

    var sparql_endpoint = 'https://query.wikidata.org/sparql';
    var query = `
        SELECT ?country ?countryLabel ?continentLabel ?capitalLabel ?memberOfLabel ?shares_border_with ?shares_border_withLabel WHERE {
            ?country (wdt:P31/wdt:P279) wd:Q6256.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
            OPTIONAL { ?country wdt:P30 ?continent. }
            OPTIONAL { ?country wdt:P36 ?capital. }
            OPTIONAL { ?country wdt:P463 ?memberOf. }
            OPTIONAL { ?country wdt:P47 ?shares_border_with. }
        }
    `;

    var data = {
        queryLn: 'SPARQL',
        query: query,
        limit: 'none',
        infer: 'true',
        Accept: 'application/sparql-results+json'
    };
    console.log('Starting API Call');
    axios.get(sparql_endpoint, data).then(function (response) {
        // handle success
        console.log('On success API Call');
        // console.log(response.results.bindings);
        res.send(response);
    }).catch(function (error) {
        // handle error
        console.log('On error API Call');
        console.log(error);
        res.send(error);
    }).then(function () {
        // always executed
        console.log('Post HTTP API Call');
        // res.send('Done...');
    });

    // var data = {
    //     queryLn: 'SPARQL',
    //     query: query ,
    //     limit: 'none',
    //     infer: 'true',
    //     Accept: 'application/sparql-results+json'
    // };
    // console.log('Starting API Call');
    // try {
    //     var response = await axios.post(sparql_endpoint, data);
    //     console.log('On success API Call');
    //     console.log(response);onsole.log(response);
    // } catch (error) {
    //     console.log('On error API Call');
    //     console.error(error);
    // }
    // console.log('Post HTTP API Call');
    // res.message('Done...');
});
app.get('/annotate', (req, res, next) => {
    var html_form = `
    <form method="post" action="annotate">
        <textarea name="input" placeholder="Enter text to annotate" style="width:100%;max-width: 500px;" rows="7"></textarea>
        <br><br>
        <button type="Submit">Submit</button>
    </form>
    `;
    res.send(html_form)
});
app.post('/annotate', async (req, res, next) => {
    var input = req.body.input

    if (input.trim() == ''){
        return res.send('Input cannot be empty')
    }
    var html_form = `
        <form method="post" action="annotate">
            <textarea name="input" placeholder="Enter text to annotate" style="width:100%;max-width: 500px;" rows="7">${input}</textarea>
            <br><br>
            <button type="Submit">Submit</button>
        </form>
    `;
    try{
        var triples = await sentence2Triples(input);
    } catch(ex){
        html_form += `<h2>Error</h2><span style="color:red;">${ex}</span>`
        return res.send(html_form)
    }
    var nodes = await falconLinker(input);

    await verifySentenceTriples(triples[0], nodes);

    // console.log(triples)
    var data = JSON.stringify(triples);
    // console.log(data)
    html_form += `<h2>Response</h2><span style="color:green;">${data}</span>`
    return res.send(html_form)

    /*
        var input_file = 'tmp/input.txt'
        var output_file = 'tmp/output.json'
        var condaEnv = 'openie'

        var dirname = __dirname+'/';

        fs.writeFile(input_file, input, (err) => {
            if (err){
                console.log(err);
                return res.send(`Error while writing to file: ${err}`)
            }
            // console.log("Successfully Written to File.");
            // const annotate_cli = `conda run -n ${condaEnv} python ./python/annotate.py -i ../${input_file} -o ../${output_file}`
            const annotate_cli = `/opt/anaconda3/envs/openie/bin/python ./python/annotate.py -i ${dirname}${input_file} -o ${dirname}${output_file}`

            exec(annotate_cli, (error, stdout, stderr) => {
                var html_form = `
                <form method="post" action="annotate">
                    <textarea name="input" placeholder="Enter text to annotate" style="width:100%;max-width: 500px;" rows="7">${input}</textarea>
                    <br><br>
                    <button type="Submit">Submit</button>
                </form>
                `;

                if (error) {
                    html_form += `<h2>Error</h2><span style="color:red;">${error.message}</span>`
                    return res.send(html_form)

                    // console.log(`error: ${error.message}`);
                    // return;
                }
                if (stderr) {
                    html_form += `<h2>Error</h2><span style="color:red;">Stderr: ${stderr}</span>`
                    return res.send(html_form)

                    // console.log(`stderr: ${stderr}`);
                    // return;
                }
                // html_form += `<h2>StdOutput</h2><span style="color:red;">Stderr: ${stdout}</span>`
                // console.log(`stdout: ${stdout}`);
                // return res.send(stdout)

                fs.readFile(output_file, "utf-8", (err, data) => {
                    if (err){
                        html_form += `<h2>Error</h2><span style="color:red;">${err}</span>`
                        return res.send(html_form)
                    }
                    html_form += `<h2>Response</h2><span style="color:green;">${data}</span>`
                    return res.send(html_form)
                    // console.log(data);
                });
            
                // res.send(html_form)
            });

        });
    */
});
app.get('/neolabels', async (req, res, next) => {
    return res.send(await getNeo4jLabels());
});

async function sentence2Triples(sentence)  {
    var hash = md5(sentence);

    var input_file = `./triples_cache/${hash}.data`
    var output_file = `./triples_cache/${hash}.json`

    var already_exists = false;

    try {
        if (fs.existsSync(`${output_file}`)) {
            already_exists = true;
          //file exists
        }
    } catch(err) {
        console.error(err)
    }
    var triples = [];
    if (!already_exists){
        fs.writeFileSync(input_file, sentence);

        const triples_cli = `/opt/anaconda3/envs/openie/bin/python ./python/annotate.py -i ${input_file} -o ${output_file}`;
        var output = execSync(triples_cli);
    }
    var contents = fs.readFileSync(`./${output_file}`, 'utf8');
    triples = JSON.parse(contents);

    return triples;
}

async function falconLinker(sentence){
    var hash = md5(sentence);

    var input_file = `./falcon_cache/${hash}.data`
    var output_file = `./falcon_cache/${hash}.json`

    var already_exists = false;

    try {
        if (fs.existsSync(`${output_file}`)) {
            already_exists = true;
          //file exists
        }
    } catch(err) {
        console.error(err)
    }
    if (!already_exists){
        var endpoint = 'https://labs.tib.eu/falcon/falcon2/api?mode=long';
        var data = {text: sentence};
        const response = await axios.post(endpoint,data, {headers: {"Content-Type": "application/json"}});
        
        var data = JSON.stringify(response.data);

        console.log(response.data);
        
        fs.writeFileSync(output_file, data);

        return response.data;
    }
    var contents = fs.readFileSync(`./${output_file}`, 'utf8');
    var output = JSON.parse(contents);

    return output;
}

async function verifySentenceTriples(triple, nodes){
    console.log(triple);
    var subject = triple.subject;
    var relation = triple.relation;
    var object = triple.object;

    var wikidata_entities = nodes.entities_wikidata;
    var wikidata_relation = nodes.relations_wikidata;

    console.log(wikidata_entities);

    var subject_match = matchEntity(subject, wikidata_entities);
    if (!subject_match){
        subject_match = matchNeo4jType(subject);
    }
    var object_match = matchEntity(object, wikidata_entities);
    if (!object_match){
        object_match = matchNeo4jType(object);
    }
    if (!object_match){
        object_match = matchNounTriples(object);
    }


    console.log('Matched Subject: ');
    console.log(subject_match);

    // heuristics
    // match subject:type to another object:entity via relation
    // match subject:entity to object:entity via relation
    // match subject:entity to object:value via attribute

    // subject is type, match 
    // relation: is, has

    // Matching Rules
    // xx is a xxx => matching subject:entity relation:instance_of object:type
    // xx has a xxx => matching subject:entity relation:attribute object:attribute of subject
    // xx of xxx => subject:attribute relation:attribute attribute:value
    // xx is xxx => subject:entity relation:instance_of object:type
    // xx is xxx => subject:type relation:instance_of object:entity
    // xx has xxx of xxxx => subject:type relation:attribute object:attribute_value

    // subject[label] relation object[label] => 
    // subject:type relation object =>
    // subject:entity relation object:type => 
    // 

    var rules = [
        'subject:entity-relation:instance_of-object:type',
        'subject:entity-relation:has_attribute-object:attribute',
        'subject:entity-relation:attribute-object:value',
        'subject:type-relation:has_attribute-object:attribute',
        'subject:type-relation:relation-object:entity',
        'subject:entity-relation:relation-object:entity',



        // 'subject:type-relation:has_attribute-object:attribute',
        // 'subject:entity-relation:property-object:attribute',
        // 'subject:entity-relation:property-object:attribute',
    ];
   
    var kb_possible_relation = [

    ];

}

async function matchNounTriples(text){
    var entity = {
        match: 'attribute', path: 'value', value: wikidata_entity_id, attr_value: ''
    };
    var parts = text.split(' ');
    if (parts.length == 3 && parts[1]=='of'){
        entity.value = parts[0].trim();
        entity.attr_value = parts[2].trim();

        return entity;
    }
    return undefined;
}

async function matchEntity(text, wikidata_entities){
    var entity = undefined;
    // {'match_type': 'id/label', value: value}

    console.log('Matching entity');

    if (!wikidata_entities){
        console.log('Matching source null');
        return entity;
    }

    console.log('Looping through possible matches');
    

    for (var i=0; i< wikidata_entities.length;i++){
        var wikidata_entity = wikidata_entities[i];
        var wikidata_entity_id = wikidata_entity[0].replace('/[<>]/','').replace('http://www.wikidata.org/entity/', '');;
        var wikidata_entity_label = wikidata_entity[1];

        console.log(`${wikidata_entity_label} vs ${text}`);
        if (wikidata_entity_label.toLowerCase() == text.toLowerCase()){
            // match found
            console.log('Matched entity found');
            entity = {
                match: 'entity', path: 'id', value: wikidata_entity_id
            };
            return entity;
            break;
        }   
    }

    return entity;
}

var types = undefined;
async function matchNeo4jType(text){
    if (!types){
        types = await getNeo4jLabels();
    }
    types.forEach(type => {
        var label = type.label;

        if (label.toLowerCase() == text.toLowerCase()){
            entity = {
                match: 'type', path: 'label', value: label
            };
            return entity;
        }
    });
    return null;
}

async function getNeo4jLabels(){
    var query = 'MATCH (n) RETURN distinct labels(n), count(*)';
    var params = {};
    var session = getNeo4jSession();

    var labels = [];

    try {
        var result = await session.run(query, params)

        console.log('Neo4j labels: ')

        result.records.forEach(record => {
            var fields = record._fields;
            var label = fields[0][0];
            var count = fields[1].low;
            labels.push({label: label, count: count});
        });
        console.log(labels);

    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return labels;
}

function md5(string){
    return crypto.createHash('md5').update(string).digest('hex');
}

// Default response for any other request
app.use(function (req, res) {
    res.status(404);
});

var port = process.env.PORT || 3000;
app.listen(port, () => {


    console.log("Server running on port " + port);
});

async function fetchAll(res) {

    var query = 'MATCH (n) RETURN n LIMIT 25'

    try {
        var result = await session.run(query, {})
    } catch (error) {
        console.log(error)
        return res.send('Error occurred')
    }

    // const singleRecord = result.records[0]
    // const node = singleRecord.get(0)
    console.log("Done...")

    return res.json(result);


}

function loadCountriesFromCSV() {
    var csv_file = './data/';
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', (row) => {

        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
        });
}


function initLanguagesFromCSV(res) {
    var csv_file = './data/all languages.csv';
    console.log('CSV Read Started.')
    var count = 0;
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(row)
            count++
            var langName = row.languageLabel;
            var wikiId = row.language.replace('http://www.wikidata.org/entity/', '');
            var wikiUrl = row.language;

            var result = await createMergeLanguage(wikiId, langName);
        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
            res.send("Done...")
        });
}

async function createMergeLanguage(wikiId, name) {
    // MERGE (n:Author {email: {email}}) ON CREATE SET n.name = {name} RETURN n

    var query = 'MERGE (lang:Language {wikiId: $wikiId}) ON CREATE SET lang.label=$label';
    var params = { wikiId: wikiId, label: name };
    var session = getNeo4jSession()

    try {
        var result = await session.run(query, params)
        console.log(`Language ${name} added/merged`)

    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
}

function initContinentsFromCSV(res) {
    var csv_file = './data/all_continents.csv';
    console.log('CSV Read Started.')
    var count = 0;
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(row)
            count++
            var name = row.continentLabel;
            var wikiId = row.continent.replace('http://www.wikidata.org/entity/', '');

            var result = await createMergeContinent(wikiId, name);
        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
            res.send("Done...")
        });
}

async function createMergeContinent(wikiId, name) {
    var query = 'MERGE (continent:Continent {wikiId: $wikiId}) ON CREATE SET continent.label=$label';
    var params = { wikiId: wikiId, label: name };
    var session = getNeo4jSession()

    try {
        var result = await session.run(query, params)
        console.log(`Continent ${name} added/merged`)
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
}

function initCountriesFromCSV(res) {
    var csv_file = './data/country_data.csv';
    console.log('CSV Read Started.')
    var count = 0;
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(row)
            count++
            var label = row.countryLabel;
            var wikiId = row.country.replace('http://www.wikidata.org/entity/', '');
            var presidentWikiId = row.head_of_state.replace('http://www.wikidata.org/entity/', '');
            var presidentLabel = row.head_of_stateLabel;
            var capitalWikiId = row.capital.replace('http://www.wikidata.org/entity/', '');
            var capitalLabel = row.capitalLabel;
            var population = row.population;
            var callingCode = row.country_calling_code;
            var currencyWikiId = row.currency.replace('http://www.wikidata.org/entity/', '');
            var currencyLabel = row.currencyLabel;

            var result = await createMergeLinkCountryData(row);
        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
            res.send("Done...")
        });
}

async function createMergeLinkCountryData(row) {
    var label = row.countryLabel;
    var wikiId = row.country.replace('http://www.wikidata.org/entity/', '');
    var presidentWikiId = row.head_of_state.replace('http://www.wikidata.org/entity/', '');
    var presidentLabel = row.head_of_stateLabel;
    var capitalWikiId = row.capital.replace('http://www.wikidata.org/entity/', '');
    var capitalLabel = row.capitalLabel;
    var population = row.population;
    var callingCode = row.country_calling_code;
    var currencyWikiId = row.currency.replace('http://www.wikidata.org/entity/', '');
    var currencyLabel = row.currencyLabel;

    var query = `
    MERGE (country:Country {wikiId: $wikiId}) ON CREATE SET country.label=$label, country.population=$population, country.callingCode=$callingCode
    MERGE (person:Person {wikiId: $presidentWikiId}) ON CREATE SET person.label=$presidentLabel
    MERGE (capital:Place {wikiId: $capitalWikiId}) ON CREATE SET capital.label=$capitalLabel
    MERGE (currency:Currency {wikiId: $currencyWikiId}) ON CREATE SET currency.label=$currencyLabel
    CREATE (person)-[:PRESIDENT_OF]->(country),(capital)-[:CAPITAL_OF]->(country),(currency)-[:OFFICIAL_CURRENCY_OF]->(country)
    `;
    var params = {
        wikiId: wikiId,
        label: label,
        population: population,
        callingCode: callingCode,
        presidentLabel: presidentLabel,
        presidentWikiId: presidentWikiId,
        callingCode: callingCode,
        capitalLabel: capitalLabel,
        capitalWikiId: capitalWikiId,
        currencyWikiId: currencyWikiId,
        currencyLabel: currencyLabel,
    };
    var session = getNeo4jSession()

    try {
        var result = await session.run(query, params)
        console.log(`Country data ${label} added/merged`)
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
}

function initCountryContinentLinking(res) {
    var csv_file = './data/country_continent.csv';
    console.log('CSV Read Started.')
    var count = 0;
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(row)
            count++
            var countryId = row.country.replace('http://www.wikidata.org/entity/', '');;
            var rawContinentIds = row.continents.replace('http://www.wikidata.org/entity/', '');

            var continentIds = rawContinentIds.split(';');
            for (i = 0; i < continentIds.length; i++) {
                var continentId = continentIds[i].trim()
                if (continentId !== '') {
                    var result = await linkCountryContinent(countryId, continentId);
                }
            }
        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
            res.send("Done...")
        });
}

async function linkCountryContinent(countryId, continentId) {

    var query = `
    MATCH (c:Country {wikiId: $countryId})
    MATCH (cont:Continent {wikiId: $continentId})
    MERGE (c)-[:MEMBER_COUNTRY_OF]->(cont)
    `;
    var params = {
        countryId: countryId,
        continentId: continentId,

    };
    var session = getNeo4jSession()

    try {
        var result = await session.run(query, params)
        console.log(`Country data ${countryId} added/merged to continent`)
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
}

function initOfficialLanguageLinking(res) {
    var csv_file = './data/country_official_language.csv';
    console.log('CSV Read Started.')
    var count = 0;
    fs.createReadStream(csv_file)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(row)
            count++
            var countryId = row.country.replace('http://www.wikidata.org/entity/', '');;
            var rawOfficialLanguages = row.officialLanguages.replace('http://www.wikidata.org/entity/', '');

            var officialLanguages = rawOfficialLanguages.split(';');
            for (i = 0; i < officialLanguages.length; i++) {
                var officialLanguage = officialLanguages[i].trim()
                if (officialLanguage !== '') {
                    var result = await linkCountryOfficialLanguage(countryId, officialLanguage);
                }
            }
        })
        .on('end', () => {
            console.log('CSV file successfully processed: ' + count);
            res.send("Done...")
        });
}

async function linkCountryOfficialLanguage(countryId, languageId) {

    var query = `
    MATCH (c:Country {wikiId: $countryId})
    MATCH (l:Language {wikiId: $languageId})
    MERGE (c)-[:OFFICIAL_LANGUAGE]->(l)
    `;
    var params = {
        countryId: countryId,
        languageId: languageId,

    };
    var session = getNeo4jSession()

    try {
        var result = await session.run(query, params)
        console.log(`Country ${countryId} and language ${languageId} added/merged `)
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
}

// Create CONSTRAINT ON (a:Author) ASSERT a.email IS UNIQUE

async function emptyDatabase() {
    var query = 'MATCH (n) DETACH DELETE n';
}
