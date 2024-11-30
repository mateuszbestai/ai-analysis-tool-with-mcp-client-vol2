from typing import Dict, List, TypedDict, overload
import xml.etree.ElementTree as ET

import pandas


def ensure_tag(root: ET.Element, tag_name: str):
    tag = root.find(tag_name)
    if tag is None:
        raise Exception(f"No <{tag_name}> tag found")
    return tag


@overload
def ensure_attr(element: ET.Element, property_name: str, number: True) -> int: ...


@overload
def ensure_attr(element: ET.Element, property_name: str) -> str: ...


def ensure_attr(
    element: ET.Element, property_name: str, number: bool | None = None
) -> str | int:
    tmp = element.get(property_name)
    if tmp is None:
        raise Exception(
            f"<{element}>'s Attribute \"{property_name}\" doesn't exist in {element.tag}"
        )
    if not number:
        return tmp
    try:
        num = int(tmp)
    except ValueError:
        raise Exception(
            f"<{element}>'s Attribute \"{property_name}\" couldn't be parsed as an int"
        )
    return num


def _xml_to_dicts(filename: str | None, xml_buf: str | None=None):
    if xml_buf is None:
        tree = ET.parse(filename)
    else:
        tree = ET.ElementTree(ET.fromstring(xml_buf))
    root = tree.getroot()
    if root.tag != "worksheetExport":
        raise Exception("Root tag is not <worksheetExport>")

    class MetadataDict(TypedDict):
        name: str
        qbeExpression: None | str

    content: Dict[str, List[str]] = dict()
    metadata: Dict[str, MetadataDict] = dict()

    metadataTag = ensure_tag(root, "metadata")
    qbeExpressionsTag = ensure_tag(root, "qbeExpressions")
    rowsTag = ensure_tag(root, "rows")
    rowCount = ensure_attr(rowsTag, "rowCount", True)

    columnCount = ensure_attr(metadataTag, "columnCount", True)
    i = 0
    for childTag in metadataTag:
        if childTag.tag != "columnDef":
            raise Exception(f"Unrecognized tag in <metadata>: <{childTag.tag}>")
        id = ensure_attr(childTag, "id")
        if id in metadata:
            raise Exception(f'Duplicate attr "id" in columnDef: {id}')
        colname = childTag.text
        if colname is None:
            print(f"No column name in <columnDef>, falling back to id: {id}")
            colname = id
        if colname in content:
            print(
                f"Duplicate <columnDef> text content: {colname}, falling back to id: {id}"
            )
            colname = id
        content[colname] = []
        metadata[id] = {"name": colname, "qbeExpression": None}
        i += 1

    if i != columnCount:
        raise Exception("attr columnCount and number of <columnDef> tags mismatch")

    for childTag in qbeExpressionsTag:
        if childTag.tag != "qbeExpression":
            raise Exception(f"Unrecognized tag in <qpeExpressions>: <{childTag.tag}>")
        id = ensure_attr(childTag, "id")
        if id in metadata:
            metadata[id]["qbeExpression"] = childTag.text
        else:
            print("qbeExpression refers to an unknown columnDef id")

    for rowTag in rowsTag:
        for colTag in rowTag:
            id = ensure_attr(colTag, "id")
            content[metadata[id]["name"]].append(
                colTag.text if colTag.text is not None else ""
            )

    for k, v in content.items():
        if rowCount != len(v):
            raise Exception("Different size rows in XML.")

    return content, metadata

def xml_str_to_df(xml: str):
    return pandas.DataFrame.from_dict(_xml_to_dicts(None, xml)[0])
    
def xml_file_to_df(filename: str):
    return pandas.DataFrame.from_dict(_xml_to_dicts(filename)[0])


# test
if __name__ == "__main__":
    raise Exception(
        "Don't run this file directly. If you absolutely know what you're doing, edit it to remove this error."
    )
    import pandas

    df = xml_file_to_df("kina.xml")
    with pandas.option_context("display.max_columns", None):
        print(df.head(6))
    # with pandas.option_context('display.max_rows', None, 'display.max_columns', None):  # more options can be specified also
