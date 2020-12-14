



conda env create -f environment.yml
conda activate openie

pip install stanford_openie
pip install graphviz

https://github.com/philipperemy/Stanford-OpenIE-Python


Title
# Verifying Facts about Entities using a Knowledge Graph
----------------------------------------------

## Requirements:

1. Python: Can be downloaded from [Python Download Page](https://www.python.org/downloads/)
2. NodeJS: Can be downloaded from [NodeJS Download Page](https://nodejs.org/en/download/)
3. Java Development Kit (JDK): Can be downloaded from [Oracle JDK Download Page](https://www.oracle.com/ca-en/java/technologies/javase/javase-jdk8-downloads.html)
4. Neo4j: Neo4j desktop can be downloaded from [Neo4j Download Page](https://neo4j.com/download/)

## Dependencies:
Python depedencies can be installed using [Anaconda](https://www.anaconda.com/) or [Python installer for Python(PIP)](https://pypi.org/project/pip/).

The only dependency not already included in the source code is the Stanford OpenIE Python Wrapper. Installation instructions can be found [here](https://github.com/philipperemy/Stanford-OpenIE-Python).

The NodeJS dependencies can be installed using the `npm install` command from terminal.


## Getting Started:
There are a number of steps required to get the system up and running:
1. Configure the Neo4j credentials: This can be done from the .env file.
2. Starting the NodeJS app: This can be done using the *npm run start* command
3. Populating the Neo4j Database: A dump of the database is provided in *./data/graph.dump.db*. This dump can be restored using the terminal command below:

> neo4j-admin load --from=path-to/graph.dump.db --database=database-name

If the database used to load doesnt exists prior to loading, it must be created afterwards using the `CREATE DATABASE <database>`

## Using the system:
The system can be used to verify facts by calling the *http://127.0.0.1:3000/* from a browser.


