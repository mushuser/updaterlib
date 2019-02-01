var DOC_SR;
var DOC_FILENAME;
var DOC_ID;
var DOC_WIKI;
var PAGE_HEADER;

var credential;
var forbidden_words;

function init_project(doc_sr, doc_filename, doc_id, doc_wiki, page_header, creds, f_words) {
  DOC_SR = doc_sr
  DOC_FILENAME = doc_filename
  DOC_ID = doc_id
  DOC_WIKI = doc_wiki
  PAGE_HEADER = page_header
  
  credential = creds
  forbidden_words = f_words
}


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


function update_doc(wiki, force) {
  console.log("update_doc() in")
  // the very first thing
  doc_forbidden_check()
  
  var body = redditlib.get_page(wiki, DOC_SR, credential)
    
  var doc_fullrev = get_fullrev()
  var doc_rev = get_docrev(doc_fullrev)
  
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

  var pdf_id = save_pdf(DOC_ID, doc_rev)
 
  var links = upload(pdf_id)
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
  
  var linkstr = get_links_str(links)
  var newbody = get_newpage(linkstr, doc_fullrev)
  if(forbidden_check(newbody, forbidden_words) != true) {
    throw "forbidden_check() failed"  
  }  
  var result = redditlib.update_wiki(wiki, newbody, DOC_SR, credential)
  console.log("update_doc() out")
}


function get_datestr() {
  var now = new Date()

  
  var day = now.getDate();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();
  
  var result = year + "-" + ((month<10)?"0":"") + month + "-" + ((day<10)?"0":"") + day

  return result  
}


function get_docrev(fullrev) {
  var rev = fullrev.match(/\[(\d+)\]/)[1]
  return rev
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


function get_guiderev(fullrev) {
  var rev = fullrev.match(/\[(\d+)\]/)[1]
  return parseInt(rev)
}


function get_redditrev(body) {
  var m = body.match(/\[(\d+)\]/)
  var rev = m[1]
  
  return parseInt(rev)
}


function get_newpage(linkstr, fullrev) {
  var header = PAGE_HEADER
  var body = header + linkstr + "***\n\n" + fullrev
  
  return body
}


function upload(pdf_id) {  
  var uploads = [anonfilecom_upload, uploadfilesio_upload, transfersh_upload]
//  var uploads = [anonfilecom_upload, uploadfilesio_upload]
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
      Utilities.sleep(1000 * 30)    
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
  var url = 'https://anonfile.com/api/upload'
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