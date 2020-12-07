import json
import getopt
import sys
from openie import StanfordOpenIE

print(sys.path)


# Store input and output file names
ifile = ''
ofile = ''

###############################
# o == option
# a == argument passed to the o
###############################
# Cache an error with try..except
# Note: options is the string of option letters that the script wants to recognize, with
# options that require an argument followed by a colon (':') i.e. -i fileName
#
try:
    myopts, args = getopt.getopt(sys.argv[1:], "hi:o:")
except getopt.GetoptError as e:
    print(str(e))
    print("Usage: %s -i input -o output" % sys.argv[0])
    sys.exit(2)


# print('Arguments...')
# print (myopts)

for o, a in myopts:
    if o == '-h':
        print('annotate.py -i <inputfile> -o <outputfile>')
        sys.exit()
    elif o == '-i':
        ifile = a
    elif o == '-o':
        ofile = a
    else:
        print("Usage: %s -i input -o output" % sys.argv[0])

# Display input and output file name passed as the args
print("Input file : %s and output file: %s" % (ifile, ofile))


def annotate(str):
    with StanfordOpenIE() as client:
        triples = client.annotate(str)
        return triples


if __name__ == "__main__":
    input_file = open(ifile, "r")
    input_text = input_file.read()
    input_file.close()

    print('Input Text: ', input_text)

    triples = annotate(input_text)

    print('Triples:')
    print(triples)

    json_dump = json.dumps(triples)

    output_file = open(ofile, "w")
    output_file.write(json_dump)
    output_file.close()  # to change file access modes

    print('Done.')
