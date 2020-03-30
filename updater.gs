var DOC_SR;
var DOC_FILENAME;
var DOC_ID;
var DOC_WIKI;
var PAGE_HEADER;

var credential;
var forbidden_words;

//function init_project(doc_sr, doc_filename, doc_id, doc_wiki, page_header, creds, f_words) {
function init_project(params) {
  DOC_SR = params.doc_sr
  DOC_FILENAME = params.doc_filename
  DOC_ID = params.doc_id
  DOC_WIKI = params.doc_wiki
  PAGE_HEADER = params.page_header
  
  credential = params.creds_wikibot
  forbidden_words = params.forbidden_words
}

var spro = PropertiesService.getUserProperties();

function check_init() {
  if( 
    (credential == undefined) ||        
    (DOC_SR == undefined) ||    
    (DOC_FILENAME == undefined) ||
    (DOC_ID == undefined) ||
    (DOC_WIKI == undefined) ||
    (PAGE_HEADER == undefined) 
  ) {
    var msg = "updaterlib.check_init() failed, call init_project()"
    console.log("credential: %s", JSON.stringify(credential))
    console.log("DOC_SR: %s", DOC_SR)
    console.log("DOC_FILENAME: %s", DOC_FILENAME)
    console.log("DOC_ID: %s", DOC_ID)
    console.log("DOC_WIKI: %s", DOC_WIKI)
    console.log("PAGE_HEADER: %s", PAGE_HEADER)
//    console.log(msg)
    throw msg
  }
}


function forbidden_check(text, check_list) {
  for(var i in check_list) {
    var check = check_list[i]
    
    if(text.indexOf(check) > -1) {
      return check  
    }
  }
  
  return true
}


function validate_anonfile_uploaded(links, pdf_size) {
  for(var i in links) {
    var link = links[i]
    var m = link.match(/anonfile.com\/(\w*)/)
    if(m != null) {
      var id = m[1]
      var url = "https://anonfile.com/api/v2/file/" + id + "/info"
      var text = httplib.httpretry(url)
      
      var json = JSON.parse(text)
      
      if((json.status == true) && (json.data.file.metadata.size.bytes == pdf_size)) {
        return true  
      }
    }
  }
  
  
  return false
}

var next_pdf_id = "next_pdf_id"
var next_uploader = "next_uploader"
var uploaded_links = "uploaded_links"

function update_doc(wiki, force) {
  console.log("update_doc() in")
  // the very first thing
  doc_forbidden_check()
  
  var body = redditlib.get_page(wiki, DOC_SR, credential)
    
  var rev_history = get_docrev_history()
  var doc_rev = get_docrev(rev_history)
  
  console.log("doc_rev: %d", doc_rev)

  if( force == undefined ) {
    var reddit_rev = get_redditrev(body)
    console.log("reddit_rev: %d", reddit_rev)
    
    if(doc_rev <= reddit_rev) {
      console.log("latest rev on reddit, exiting!")
      return        
    } else {
      console.log("updating to doc_rev: %d", doc_rev)
    }    
  } else {
    console.log("force updating to doc_rev: %d", doc_rev)
  } 
  
  var doc = DocumentApp.openById(DOC_ID)
  if(!check_pubkey(doc)) {
    throw "pubkey check failed"  
  }
  
  var pdf_id = save_pdf(DOC_ID, doc_rev)
  spro.setProperty(next_pdf_id, pdf_id)  
  console.log("next_pdf_id: %s", pdf_id)
  
  var uploaders = ["anonfilecom_upload", "uploadfilesio_upload", "transfersh_upload"]
  spro.setProperty(next_uploader, uploaders.join(","))  
  console.log("next_uploader: %s", uploaders)
  
  //uploaded_links
  spro.deleteProperty(uploaded_links)
  
  console.log("next_upload trigger from update_doc()")
  ScriptApp.newTrigger(next_upload_execution)
  .timeBased()
  .after(trigger_duration_1)
  .create();
}

var trigger_duration_1 = 1000 //60 * 1000 * 2
var trigger_duration_2 = 60 * 1000 * 5

var next_upload_execution = "updaterlib.next_upload"



function next_upload() {
  console.log("next_upload() start")

  var uploaders_ = spro.getProperty(next_uploader)
  if(uploaders_ == null) {
    throw "uploaders_ == null"
  } else {
    var uploaders = uploaders_.split(",")  
  }
  console.log("uploaders: %s", uploaders)
  
  var pdf_id = spro.getProperty(next_pdf_id)
  console.log("pdf_id: %s", pdf_id)

  var links_ = spro.getProperty(uploaded_links)
  if(links_ == null) {
    var links = []
  } else {
    var links = links_.split(",")  
  }  
  console.log("links: %s", links)
  
  if(uploaders.length > 0) {
    var uploader = uploaders.pop()
    var new_next_uploader = uploaders.join(",")
    console.log("new_next_uploader: %s", new_next_uploader)
    spro.setProperty(next_uploader, new_next_uploader) 
    
    var link = ""
    var evalstr = Utilities.formatString("link = %s(\"%s\")", uploader, pdf_id)
    console.log(evalstr)
    eval(evalstr)
    console.log("link: %s", link)
    
    // no retry, on uploader failed

    if(link != undefined) { 
      links.push(link)
      spro.setProperty(uploaded_links, links.join(",")) 
      
      console.log("uploaded_links: %s", links)  
    }    

    if(uploaders.length > 0) {
      console.log("next_upload trigger from next_upload(): %s", uploaders)
      
      ScriptApp.newTrigger(next_upload_execution)
      .timeBased()
      .after(trigger_duration_1)
      .create();
    } else {
      console.log("update_doc_final()")
      update_doc_final(links, pdf_id)      
    }
  } 
  
//  else {
//    if(pdf_id == "") {
//      // everything done
//      //deleteTrigger
//      console.log("done!!!")
//      return
//    } else {
//      // update doc
//      console.log("update_doc_final()")
//      update_doc_final(links, pdf_id)
//    }
//  }
}


function update_doc_final(links, pdf_id) {
  console.log("update_doc_final() in: %s, %s", links, pdf_id)
  var pdf = DriveApp.getFileById(pdf_id)
  var pdf_size = pdf.getSize()
  
  pdf.setTrashed(true)
  
  if( links.length < 1 ) {
    var msg = "all uploads failed!"
    console.log(msg)
    throw msg
  }
  
  if(validate_anonfile_uploaded(links, pdf_size) == false) {
    throw "anonfile uploaded failed"  
  } else {
    console.log("anonfile uploaded ok")  
  }
  var rev_history = get_docrev_history()
  var linkstr = get_links_str(links)
  var newbody = get_newpage(linkstr, rev_history)
  if(forbidden_check(newbody, forbidden_words) != true) {
    throw "forbidden_check() failed"  
  }  
  
  var result = redditlib.update_wiki(DOC_WIKI, newbody, DOC_SR, credential)
  //
  
  console.log("clear_outdated_trigger()")
  ScriptApp.newTrigger("clear_outdated_trigger")
  .timeBased()
  .after(trigger_duration_1)
  .create();
  
  console.log("update_doc_final() out")
}  


function get_datestr() {
  var now = new Date()

  
  var day = now.getDate();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();
  
  var result = year + "-" + ((month<10)?"0":"") + month + "-" + ((day<10)?"0":"") + day

  return result  
}


function doc_forbidden_check() {
  var doc = DocumentApp.openById(DOC_ID)
  var text = doc.getBody().getText().toLowerCase()
  
  var check = forbidden_check(text, forbidden_words)
  if( check!= true) {
    throw "forbidden_check() failed:" + check
  }
  
  return true
}


function get_bookmark_p(doc, text) {
  var bms = doc.getBookmarks()
  
  for(var i in bms) {
    var bm = bms[i]
    var p = bm.getPosition()
    var t = p.getSurroundingText().asText().getText()

    if(t == text) {
        return p
    }
  }
  
  return undefined
}

function get_doctext_p(position, doubleNL, end, skipFirst) {
  var texts = ""
  var np = position
  
  var next_t = position.getSurroundingText()
  
  if(skipFirst) {
    next_t = next_t.asText().getNextSibling()
  }
  
  for(var i=0; next_t!=null; i++) {
    var next_text = next_t.asText().getText()
  
    if(end == next_text) {
      return texts+end
    }
    
    if(doubleNL) {
      if(next_text == "") {
        next_text = "\n\n"  
      }
    } else {
      next_text += "\n"  
    }
    texts = texts + next_text
    next_t = next_t.asText().getNextSibling()  
  }

  return texts
}

function get_docrev_history() {
  var doc = DocumentApp.openById(DOC_ID)
  var p = get_bookmark_p(doc, "文件更新明細")
  
  
  return get_doctext_p(p, true, undefined, true)
  
  var history = ""
  
  for(var i=0; nextsb != null ;i++) {
    var nexttext = nextsb.asText().getText()
    if( nexttext == "" ) {
      nexttext = "\n\n"  
    }
    history = history + nexttext
    nextsb = nextsb.getNextSibling()  
  }

  return history
}



function get_docrev(docrev_history) {
  var rev = docrev_history.match(/\[(\d+)\]/)[1]
  
  if(rev == undefined) {
    return undefined
  } else {  
    return parseInt(rev)
  }  
}


function get_redditrev(body) {
  var m = body.match(/\[(\d+)\]/)
  var rev = m[1]
  
  return parseInt(rev)
}


function get_newpage(linkstr, doc_rev_history) {
  var header = PAGE_HEADER
  var body = header + linkstr + "***\n\n" + doc_rev_history
  
  return body
}


function upload(pdf_id) {  
//  var uploads = [anonfilecom_upload, uploadfilesio_upload, transfersh_upload]
  var uploads = [anonfilecom_upload]
  var links = []
  
  for(var i=0; i<uploads.length; i++) {
    try {
      var link = uploads[i](pdf_id)
    } catch(e) {
      console.log(e)
      ;;  
    }
    if( link == undefined ) {
      continue
    } else {
      links.push(link)
      Utilities.sleep(100 * 1)    
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
  console.log("save_pdf(): %s, %s", id, rev)
  var url = "https://docs.google.com/document/export?format=pdf&id=" + id
  
  var response = httplib.httpretry(url)
  var blob = response.getBlob();
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
  
  var response = httplib.httpretry(url, options, true);
  
  if( response != undefined ) {
    var text = response.getContentText()
    return text
  } else {
    console.log("failed: %s", url)
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
    console.log(result)
    return result
  }
}

// long term
/*
Files older than 36 months which has not been downloaded for 24 months.
Files older than 30 days which has never been downloaded at all.
*/
function anonfilecom_upload(id) {
  var url = 'https://api.anonfile.com/upload'
  var result = uploader(id, url)
  if( result == undefined ) {
    return undefined
  } else {  
    var json = JSON.parse(result)
    var link = json.data.file.url.short
    console.log(link)
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
    console.log(link)
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
    console.log(link)
    return link    
  }
}

function check_pubkey(doc) {
  var p = get_bookmark_p(doc, "-----BEGIN PGP PUBLIC KEY BLOCK-----")
  var t = get_doctext_p(p, false, "-----END PGP PUBLIC KEY BLOCK-----",false)
  
  return (secret.protonmail_key == t)   
}
