import {readFile} from "fs/promises"

try{
    const file = await readFile("/Users/kangmin/Desktop/personal-study/공지사항-모음/data/labels.json", {encoding : "utf-8"})
    const json = JSON.parse(file)
    console.log(json)
}catch(err){
    console.log(err)
}