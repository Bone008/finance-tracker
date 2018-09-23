import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GlobalComment } from '../../../proto/model';
import { compareTimestamps, timestampNow, timestampToDate } from '../../core/proto-util';
import { DataService } from '../data.service';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrls: ['./comments.component.css']
})
export class CommentsComponent implements OnInit {
  comments$: Observable<GlobalComment[]>;
  newCommentText = "";

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.comments$ = this.dataService.globalComments$.pipe(
      map(comments => comments.sort((a, b) => this.compareComments(a, b)))
    );
  }

  addNewComment() {
    if (this.newCommentText.trim().length === 0) {
      return;
    }
    this.dataService.addGlobalComment(new GlobalComment({
      comment: this.newCommentText.trim(),
      created: timestampNow(),
      isArchived: false,
    }));
    this.newCommentText = "";
  }

  deleteComment(comment: GlobalComment) {
    this.dataService.removeGlobalComment(comment);
  }

  timestampToDate = timestampToDate;

  private compareComments(a: GlobalComment, b: GlobalComment): number {
    if ((a.isArchived === true) !== (b.isArchived === true)) {
      return +a.isArchived - +b.isArchived;
    } else {
      return -compareTimestamps(a.created, b.created);
    }
  }
}
