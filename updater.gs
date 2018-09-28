/*
updaterlib.init_project(doc_filename, doc_id, doc_wiki, page_header)
updaterlib.check_init()
*/

var DOC_FILENAME;
var DOC_ID;
var DOC_WIKI;
var PAGE_HEADER;


function init_project(doc_filename, doc_id, doc_wiki, page_header) {
  DOC_FILENAME = doc_filename
  DOC_ID = doc_id
  DOC_WIKI = doc_wiki
  PAGE_HEADER = page_header
}


function check_init() {
  if( 
    (DOC_FILENAME == undefined) ||
    (DOC_ID == undefined) ||
    (DOC_WIKI == undefined) ||
    (PAGE_HEADER == undefined) 
  ) {
    Logger.log("check_init() failed, call init_project()")    
  }
}

function update_doc(wiki, force) {

  var body = redditlib.get_page(wiki)
  var doc_fullrev = get_fullrev()
  var doc_rev = get_docrev(doc_fullrev)
  
  Logger.log("doc_rev=" + doc_rev)

  if( force == undefined ) {
    var reddit_rev = get_redditrev(body)
    Logger.log("reddit_rev=" + reddit_rev)
    
    if(doc_rev <= reddit_rev) {
      Logger.log("latest rev on reddit, exiting!")
      return        
    }
  } else {
    Logger.log("force to upload")      
  }

  var pdf_id = save_pdf(DOC_ID, doc_rev)
  
  var links = upload(pdf_id)
  DriveApp.getFileById(pdf_id).setTrashed(true)
  
  if( links.length < 1 ) {
    var msg = "all uploads failed!"
    Logger.log(msg)
    throw msg
  }
  
  var linkstr = get_links_str(links)
  var newbody = get_newpage(linkstr, doc_fullrev)
  var result = redditlib.update_wiki(wiki, newbody)
}

function get_docrev(fullrev) {
  var rev = fullrev.match(/\[(\d+)\]/)[1]
  return rev
}

function get_fullrev() {
  var doc = DocumentApp.openById(DOC_ID)
  var b0 = (doc.getBookmarks())[0]
  var nextsb = b0.getPosition().getSurroundingText().getNextSibling()
  var fullrev = ""
  
  for(var i=0; nextsb != null ;i++) {
    var nexttext = nextsb.asText().getText()
    if( nexttext == "" ) {
      nexttext = "\n\n"  
    }
    fullrev = fullrev + nexttext
    nextsb = nextsb.getNextSibling()  
  }
  
  return fullrev
}



function get_redditrev(body) {
  var m = body.match(/\[(\d+)\]/)
  var rev = m[1]
  
  return rev
}


function get_newpage(linkstr, fullrev) {
  var header = PAGE_HEADER
  var body = header + linkstr + "***\n\n" + fullrev
  
  return body
}


function upload(pdf_id) {  
  var uploads = [anonfilecom_upload, uploadfilesio_upload, transfersh_upload]
  var links = []
  
  for(var i=0; i<uploads.length; i++) {
    try {
      var link = uploads[i](pdf_id)
    } catch(e) {
      Logger.log(e)
      ;;  
    }
    if( link == undefined ) {
      continue
    } else {
      links.push(link)
      Utilities.sleep(1000 * 60)    
    }
    
  }

  return links  
}


function get_links_str(links) {
  var result = ""
  for(var i=0; i<=links.length; i++) {
    if( links[i] == undefined ) {
      continue  
    }
    result = result + "[下載點" + (i+1) + "](" + links[i] + ")\n\n"
  }
  
  return result
}


function get_revdes(DOC_ID) {
  var file = DriveApp.getFileById(DOC_ID)
  var des = file.getDescription()

  var result = des.split("\n")
  return result
}



function save_pdf(id, rev) {  
  var url = "https://docs.google.com/document/export?format=pdf&id=" + id
 
  var blob = UrlFetchApp.fetch(url).getBlob();
  var file = DriveApp.createFile(blob)
  var name = DOC_FILENAME + "_v" + rev + ".pdf"
  file.setName(name)
  var newid = file.getId()

  return newid
}


function uploader(id, url) {
  var file = DriveApp.getFileById(id)
  var blob = file.getBlob()
  
  var formData = {
   'file': blob
  };
  
  var options = {
    'method' : 'post',
    'payload' : formData
  };
  
  var response = redditlib.httpretry(url, options);
  
  if( response != undefined ) {
    var text = response.getContentText()
    return text
  } else {
    return undefined 
  }
}



// 14 days
function transfersh_upload(id) {
  var url = 'https://transfer.sh'
  var result = uploader(id, url)
  if( result == undefined ) {
    return undefined
  } else {
    Logger.log(result)
    return result
  }
}


// long term
/*
Files older than 36 months which has not been downloaded for 24 months.
Files older than 30 days which has never been downloaded at all.
*/
function anonfilecom_upload(id) {
  var url = 'https://anonfile.com/api/upload'
  var result = uploader(id, url)
  if( result == undefined ) {
    return undefined
  } else {  
    var json = JSON.parse(result)
    var link = json.data.file.url.short
    Logger.log(link)
    return link
  }    
}


// ephemeral
function fileio_upload(id) {
  var url = 'https://file.io'
  var result = uploader(id, url)  
  if( result == undefined ) {
    return undefined
  } else {
    var json = JSON.parse(result)
    var link = json.link
    Logger.log(link)
    return link
  }    
}


// 30 days
function uploadfilesio_upload(id) {
  var url = "https://up.uploadfiles.io/upload"
  var result = uploader(id, url)  
  if( result == undefined ) {
    return undefined
  } else {
    var json = JSON.parse(result)
    var link = json.url
    Logger.log(link)
    return link    
  }
}

