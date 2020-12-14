var express = require("express");
const axios = require('axios').default;
const neo4j = require('neo4j-driver');
const execSync = require("child_process").execSync;
const { exec } = require("child_process");
var bodyParser = require('body-parser');
var crypto = require('crypto');

require('dotenv').config();


var csv = require('csv-parser');
var fs = require('fs');

var user = process.env.NEO4J_USER;
var password = process.env.NEO4J_PASS;
var uri = process.env.NEO4J_URI;
var database = process.env.NEO4J_DATABASE;
var python_cli = process.env.PYTHON_CLI;

// console.log(user);
// return;

var app = express();
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
const session = getNeo4jSession();

function getNeo4jSession() {
    return driver.session({ database: database, defaultAccessMode: neo4j.session.WRITE });
}


app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get("/", (req, res, next) => {
    res.send("Welcome to COMP5118 Project. Verifying Facts about Entities via Knowledge Graph.<br><br><a href='annotate'>Click here</a> to get started")
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
    <h1>Verifying Facts about Entities via Knowledge Graph</h1><p>Enter statement to verify below:</p>
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

    if (input.trim() == '') {
        return res.send('Input cannot be empty')
    }
    var html_form = `
        <h1>Verifying Facts about Entities via Knowledge Graph</h1><p>Enter statement to verify below:</p>
        <form method="post" action="annotate">
            <textarea name="input" placeholder="Enter text to annotate" style="width:100%;max-width: 500px;" rows="7">${input}</textarea>
            <br><br>
            <button type="Submit">Verify</button>
        </form>
    `;
    try {
        var triples = await sentence2Triples(input);
    } catch (ex) {
        html_form += `<h2>Error</h2><span style="color:red;">${ex}</span>`
        return res.send(html_form)
    }
    var nodes = await falconLinker(input);

    var statements = [];
    var count = 0;
    var verified_count = 0;

    for(var i=0;i<triples.length; i++){
        count += 1;
        var triple = triples[i];
        console.log(`--------> ${count}: Checking triple:${triple.subject}-${triple.relation}-${triple.object}.`);
        try{
            var verified = await verifySentenceTriples(triple, nodes);
        } catch(ex){
            console.log(`Exception thrown: ${ex}`);
            verified = false;
        }
        var verify_text = '<span style="color: red">Unverified</span>';
        if (verified){
            verify_text = '<span style="color: green">Verified</span>';
        }
        var statement = {
            text: `<p><b>${triple.subject}</b> <em>${triple.relation}</em> <b>${triple.object}</b>: ${verify_text}</p>`,
            triple: triple,
            verified: verified
        };
        verified_count += (verified ? 1 : 0);
        statements.push(statement);

        console.log(`Triple checked.`);
    }

    // console.log(triples)
    var data = JSON.stringify(triples);
    // console.log(data)
    html_form += `<h2>Response</h2><span style="color:green;">${data}</span>`;

    html_form += `<h3>BreakDown</h3>`;
    if (count == 0){
        html_form += `<p><span style="color:red;">Unable to fetch Triples from given text</span></p>`;
    } else {
        statements.forEach(async (statement) => {
            html_form += statement.text;
        });
        var verify_percent = Math.round(verified_count/count*100);
        var color = verify_percent<=50?'red': (verify_percent>=80?'green': 'orange');
        html_form += `<p><span style="color:${color};">Overall, ${verify_percent}% of the statement(s) could be verified</span></p>`;
    }


    return res.send(html_form);
});
app.get('/neolabels', async (req, res, next) => {
    return res.send(await getNeo4jLabels());
});
app.get('/initializeDb', async (req, res, next) => {
    await emptyDatabase();
    res.send('Cleared the Database');

    await emptyDatabase();
    res.send('Cleared the Database Again');


});

async function sentence2Triples(sentence) {
    var hash = md5(sentence);

    var input_file = `./triples_cache/${hash}.data`
    var output_file = `./triples_cache/${hash}.json`

    var already_exists = false;

    try {
        if (fs.existsSync(`${output_file}`)) {
            already_exists = true;
            //file exists
        }
    } catch (err) {
        console.error(err)
    }
    var triples = [];
    if (!already_exists) {
        fs.writeFileSync(input_file, sentence);

        const triples_cli = `${python_cli} ./python/annotate.py -i ${input_file} -o ${output_file}`;
        var output = execSync(triples_cli);
    }
    var contents = fs.readFileSync(`./${output_file}`, 'utf8');
    triples = JSON.parse(contents);

    return triples;
}

async function falconLinker(sentence) {
    var hash = md5(sentence);

    var input_file = `./falcon_cache/${hash}.data`
    var output_file = `./falcon_cache/${hash}.json`

    var already_exists = false;

    try {
        if (fs.existsSync(`${output_file}`)) {
            already_exists = true;
            //file exists
        }
    } catch (err) {
        console.error(err)
    }
    if (!already_exists) {
        var endpoint = 'https://labs.tib.eu/falcon/falcon2/api?mode=long';
        var data = { text: sentence };
        const response = await axios.post(endpoint, data, { headers: { "Content-Type": "application/json" } });

        var data = JSON.stringify(response.data);

        console.log(response.data);

        fs.writeFileSync(output_file, data);

        return response.data;
    }
    var contents = fs.readFileSync(`./${output_file}`, 'utf8');
    var output = JSON.parse(contents);

    return output;
}

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

var matchingRules = [
    'entity:instance_of:type',
    'entity:has_attribute:attribute',
    'entity:attribute:value',
    'type:has_attribute:attribute',
    'type:relation:entity',
    'entity:relation:entity',

    // 'subject:type-relation:has_attribute-object:attribute',
    // 'subject:entity-relation:property-object:attribute',
    // 'subject:entity-relation:property-object:attribute',
];

async function verifySentenceTriples(triple, nodes) {
    // console.log(triple);
    var subject = triple.subject;
    var relation = triple.relation;
    var object = triple.object;

    var wikidata_entities = nodes.entities_wikidata;
    var wikidata_relation = nodes.relations_wikidata;

    // if (subject != 'country'){
    //     return false;
    // }
    console.log('-------- Match Triples: ');
    console.log(triple);

    var subject_match = await matchEntity(subject, wikidata_entities);
    if (!subject_match) {
        subject_match = await matchNeo4jType(subject);
    }
    // console.log('Subject Match: ')
    // console.log(subject_match);
    // return false;

    var object_match = await matchEntity(object, wikidata_entities);
    if (!object_match) {
        object_match = await matchNeo4jType(object);
    }
    if (!object_match) {
        object_match = await matchNounTriples(object);
    }
    // console.log('Matched Subject: ');
    // console.log(subject_match);

    // console.log('Matched Object');
    // console.log(object_match);

    var candidate_entity = undefined;
    var candidate_entity_type = subject_match.path;
    var candidate_attributes = {};
    if (subject_match.match == 'entity'){
        candidate_entity = await match2KGEntity(subject_match);
        candidate_entity_type = candidate_entity.type;
        candidate_attributes = candidate_entity.attributes;

        // var candidate_relation = await matchRelation();
        if (!candidate_entity) {
            throw `Cannot verify statement, ${subject} not found in KG`;
        }
    }

    var candidate_relation = await matchRelation(relation, wikidata_relation, candidate_entity_type, candidate_attributes);
    if (!candidate_relation) {
        throw `Cannot verify relation, ${relation} not matched in KG`;
    }

    var matchRule = `${subject_match.match}:${candidate_relation.match}:${object_match.match}`;
    if (!matchingRules.includes(matchRule)) {
        throw `Cannot verify statement, Unable to find matching rule: ${matchRule}`;
    }
    console.log(`Match rule: ${matchRule}`);
    var triple_is_verified = false;
    switch (matchRule) {
        case 'entity:instance_of:type':
            
            triple_is_verified = candidate_entity.type == object_match.path;
            break;
        case 'entity:has_attribute:attribute':
            triple_is_verified = candidate_entity.attributes[object] !== undefined;
            break;
        case 'entity:attribute:value':
            if (object_match.match == 'attribute') {
                triple_is_verified = candidate_entity.attributes[object_match.path] == object_match.value;
            }
            // triple_is_verified = candidate_entity.attributes
            break;
        case 'type:has_attribute:attribute':
            var fact_entity = await fetchEntityTypeWithAttribute(subject_match.path, candidate_relation.path, object);
            triple_is_verified = fact_entity !== undefined;
            break;
        case 'type:relation:entity':
            var fact_entity = await fetchEntityTypeRelatingWith(subject_match.path, candidate_relation.path, object_match.path, object_match.value);
            console.log(fact_entity);
            triple_is_verified = fact_entity !== undefined;
            break;
        case 'entity:relation:entity':
            // match.path, match.value
            var fact_entity = await fetchEntityRelatingWith(subject_match.path, subject_match.value, candidate_relation.path, object_match.path, object_match.value);
            triple_is_verified = fact_entity !== undefined;
            break;
        default:
            console.log(`No rule for matching '${matchRule}'`)
            throw `No rule for matching '${matchRule}'`;
    }
    // 'entity:instance_of:type',
    // 'entity:has_attribute:attribute',
    // 'entity:attribute:value',
    // 'type:has_attribute:attribute',
    // 'type:relation:entity',
    // 'entity:relation:entity',

    // console.log('Verify Triple with Rule: ' + matchRule);

    console.log('Post switch')

    return triple_is_verified;
}

var kgRelationMap = {
    'is country in': 'MEMBER_COUNTRY_OF',
    'Country:is in': 'MEMBER_COUNTRY_OF',
    'Country:are in': 'MEMBER_COUNTRY_OF',
    'Person:is president of': 'PRESIDENT_OF',
    'Person:president of': 'PRESIDENT_OF',
    'Place:is capital of': 'CAPITAL_OF',
    'Place:capital of': 'CAPITAL_OF',
}
var relationMap = {
    'is a': 'instance_of',
    'is': 'instance_of',
    'has a': 'attribute',

};

async function matchRelation(text, wikidata_relation, subject_type, subject_attributes) {

    var relation;
    var relation_key = '';
    console.log('Matching Relation: ' + text + ' -- Subject type: '+ subject_type);
    console.log(wikidata_relation);

    if (kgRelationMap[text] != undefined) {
        relation = { match: 'relation', path: kgRelationMap[text] };
    } else if (subject_attributes[text] != undefined) {
        relation = { match: 'attribute', path: subject_attributes[text] };
    } else if (relationMap[text] != undefined) {
        relation = { match: relationMap[text], path: '' };
    } else if (relationMap[`${subject_type}:${text}`] != undefined) {
        relation = { match: relationMap[`${subject_type}:${text}`], path: '' };
    } else if (kgRelationMap[`${subject_type}:${text}`] != undefined) {
        relation = { match: 'relation', path: kgRelationMap[`${subject_type}:${text}`] };
    }
    console.log(`${subject_type}:${text}`);
    console.log(relation);

    // if (!wikidata_relation){
    //     console.log('Matching source null');
    //     return entity;
    // }

    return relation;
}

async function match2KGEntity(match) {
    var entity;
    console.log('Match2KG: ');
    console.log(match);

    const match_types = ['entity', 'type', 'attribute'];

    if (match == null){
        return entity;
    }

    var match_type = match.type;
    // match: 'entity', path: 'wikiId', value: wikidata_entity_id, attr_value: ''

    if (match.match == 'entity') {
        entity = await fetchEntity(match.path, match.value);
    } else if (match.match == 'type') {
        entity = {
            type: match.value, attributes: {}
        };
    }
    return entity;
}

async function matchParsedByRules() {





}

async function matchNounTriples(text) {
    var entity = {
        match: 'attribute', path: 'value', value: ''
    };
    var parts = text.split(' ');
    if (parts.length == 3 && parts[1] == 'of') {
        entity.path = parts[0].trim();
        entity.value = parts[2].trim();

        return entity;
    }
    return undefined;
}

async function matchEntity(text, wikidata_entities) {
    var entity = undefined;
    // {'match_type': 'id/label', value: value}

    console.log('Matching entity');

    if (!wikidata_entities) {
        console.log('Matching source null');
        return entity;
    }

    console.log('Looping through possible matches');


    for (var i = 0; i < wikidata_entities.length; i++) {
        var wikidata_entity = wikidata_entities[i];
        var wikidata_entity_id = wikidata_entity[0].replace('<', '').replace('>', '').replace('http://www.wikidata.org/entity/', '');;
        var wikidata_entity_label = wikidata_entity[1];

        console.log(`${wikidata_entity_id}: ${wikidata_entity_label} vs ${text}`);
        if (wikidata_entity_label.toLowerCase() == text.toLowerCase()) {
            // match found
            console.log('Matched entity found');
            entity = {
                match: 'entity', path: 'wikiId', value: wikidata_entity_id
            };
            return entity;
            break;
        }
    }

    return entity;
}

async function fetchEntityRelatingWith(subject_key, subject_value, relation, object_key, object_value) {
    var entity = undefined;
    console.log(`Fetching entity from KG by ${subject_key} with ${subject_value} relating(${relation}) with ${object_key} with ${object_value}`);

    var query = `MATCH(n {${subject_key}: $${subject_key}})-[:${relation}]-(c {${object_key}: $o_${object_key}}) return n`;
    var params = {};
    params[subject_key] = subject_value;
    params['o_'+object_key] = object_value;
    var session = getNeo4jSession();

    console.log(query);

    try {
        var result = await session.run(query, params);
        if (result.records.length == 0) {
            throw "No result";
        }
        var records = result.records;
        var node = records[0]._fields[0];
        entity = {
            id: node.identity.low,
            type: node.labels[0],
            attributes: node.properties
        };
        // console.log(node);
        // console.log(entity);
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return entity;
}

async function fetchEntityTypeRelatingWith(type, relation, key, value) {
    var entity = undefined;
    console.log(`Fetching entity type: ${type} relating(${relation}) with ${key} with ${value}`);

    var query = `MATCH(n:${type})-[:${relation}]-(c {${key}: $${key}}) return n`;
    var params = {};
    params[key] = value;
    var session = getNeo4jSession();

    try {
        var result = await session.run(query, params);
        if (result.records.length == 0) {
            throw "No result";
        }
        var records = result.records;
        var node = records[0]._fields[0];
        entity = {
            id: node.identity.low,
            type: node.labels[0],
            attributes: node.properties
        };
        // console.log(node);
        // console.log(entity);
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return entity;
}

async function fetchEntityTypeWithAttribute(type, key, value) {
    var entity = undefined;
    console.log(`Fetching entity type:${type} from KG by ${key} with ${value}`);

    var query = `MATCH(n:${type} {${key}: $${key}}) return n`;
    var params = {};
    params[key] = value;
    var session = getNeo4jSession();

    try {
        var result = await session.run(query, params);
        if (result.records.length == 0) {
            throw "No result";
        }
        var records = result.records;
        var node = records[0]._fields[0];
        entity = {
            id: node.identity.low,
            type: node.labels[0],
            attributes: node.properties
        };
        // console.log(node);
        // console.log(entity);
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return entity;
}

async function fetchEntity(key, value) {
    var entity = undefined;
    console.log(`Fetching entity from KG by ${key} with ${value}`);

    var query = `MATCH(n {${key}: $${key}}) return n`;
    var params = {};
    params[key] = value;
    var session = getNeo4jSession();

    try {
        var result = await session.run(query, params);
        if (result.records.length == 0) {
            throw "No result";
        }
        var records = result.records;
        var node = records[0]._fields[0];
        entity = {
            id: node.identity.low,
            type: node.labels[0],
            attributes: node.properties
        };
        // console.log(node);
        // console.log(entity);
    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return entity;
}

var types = undefined;
async function matchNeo4jType(text) {
    if (!types) {
        types = await getNeo4jLabels();
    }
    for (var i=0; i< types.length; i++){
        var type = types[i];
        var label = type.label;

        if (label.toLowerCase() == text.toLowerCase()) {
            entity = {
                match: 'type', path: label, value: label
            };
            return entity;
        }
    }
    return undefined;
}

async function getNeo4jLabels() {
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
            labels.push({ label: label, count: count });
        });
        console.log(labels);

    } catch (error) {
        console.log(error)
    } finally {
        await session.close()
    }
    return labels;
}

async function getNeo4jLabelRelations(label) {

}

function md5(string) {
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
